import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { PageSnapshot } from '@systembook/schema';
import { isUniqueViolation } from '../../db/errors.js';
import { createRevision, restoreRevision } from '../../db/revisions.js';
import { menus, pages, revisions, sections, tabs } from '../../db/schema.js';
import { protectedProcedure, publicProcedure, router } from '../init.js';
import { assertCompleteReorder } from './reorder.js';

// Schema único de slug compartilhado por create e updateSlug — as regras não
// podem divergir com o tempo (nota da TASK-20).
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug deve ser minúsculo e hifenizado (ex.: meu-slug)');

/**
 * Deriva um slug a partir de um título (TASK-70): remove acentos (NFD + tira as
 * marcas combinantes — importante para títulos em PT: "Botão" → "botao"),
 * minúsculo, colapsa qualquer run de não-alfanuméricos num único hífen e apara
 * hífens das pontas. O resultado (quando não-vazio) sempre casa `slugSchema`.
 * Vazio quando o título não tem caracteres sluggáveis (ex.: só emoji/símbolos).
 */
export function slugify(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugConflict(): TRPCError {
  return new TRPCError({ code: 'CONFLICT', message: 'Já existe uma página com este slug na seção' });
}

function pageNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Página não encontrada' });
}

export const pagesRouter = router({
  listBySection: protectedProcedure
    .input(z.object({ sectionId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db
        .select()
        .from(pages)
        .where(eq(pages.sectionId, input.sectionId))
        .orderBy(asc(pages.ordem), asc(pages.id))
        .all(),
    ),

  // Resolve o menu ao qual uma página pertence (page → section → menu).
  // A sidebar (TASK-86) é escopada ao menu ativo; ao navegar direto para uma
  // página de outro menu (URL/busca/breadcrumb) o admin usa isto para trocar o
  // menu ativo, mantendo a árvore consistente com o que está aberto.
  menuOf: protectedProcedure.input(z.object({ pageId: z.string() })).query(({ ctx, input }) => {
    const row = ctx.db
      .select({ menuId: sections.menuId })
      .from(pages)
      .innerJoin(sections, eq(pages.sectionId, sections.id))
      .where(eq(pages.id, input.pageId))
      .get();
    if (!row) throw pageNotFound();
    return { menuId: row.menuId };
  }),

  // Dados de cabeçalho/breadcrumb de uma página (TASK-87): título da página +
  // seção (eyebrow) + menu (nível de topo do breadcrumb), num único round-trip.
  // A página do editor consome isto para o Section Header e os breadcrumbs
  // (Menu › Seção › Página). Sem timestamps aqui: `pages`/`sections` não têm
  // `criadoEm`/`atualizadoEm` — os metadados de data/autor vêm de `revisions`.
  header: protectedProcedure.input(z.object({ pageId: z.string() })).query(({ ctx, input }) => {
    const row = ctx.db
      .select({
        pageId: pages.id,
        pageTitulo: pages.titulo,
        sectionId: sections.id,
        sectionTitulo: sections.titulo,
        menuId: menus.id,
        menuTitulo: menus.titulo,
      })
      .from(pages)
      .innerJoin(sections, eq(pages.sectionId, sections.id))
      .innerJoin(menus, eq(sections.menuId, menus.id))
      .where(eq(pages.id, input.pageId))
      .get();
    if (!row) throw pageNotFound();
    return {
      page: { id: row.pageId, titulo: row.pageTitulo },
      section: { id: row.sectionId, titulo: row.sectionTitulo },
      menu: { id: row.menuId, titulo: row.menuTitulo },
    };
  }),

  create: protectedProcedure
    // slug opcional (TASK-70): quando ausente, é derivado do título no server.
    // Se informado, é validado exatamente como antes (regex + CONFLICT na
    // colisão). O admin manda `undefined` quando o campo fica em branco.
    .input(z.object({ sectionId: z.string(), titulo: z.string().min(1), slug: slugSchema.optional() }))
    .mutation(({ ctx, input }) => {
      const section = ctx.db
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.id, input.sectionId))
        .get();
      if (!section) throw new TRPCError({ code: 'NOT_FOUND', message: 'Seção não encontrada' });

      const isDerived = input.slug === undefined;
      let slug = input.slug;
      if (isDerived) {
        const base = slugify(input.titulo);
        if (!base) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'O título não gera um slug válido — informe um slug manualmente.',
          });
        }
        slug = base;
      }

      const row = ctx.db
        .select({ maxOrdem: max(pages.ordem) })
        .from(pages)
        .where(eq(pages.sectionId, input.sectionId))
        .get();
      try {
        // Página + tab primária (o corpo da página) na mesma transação — toda
        // página nasce com exatamente uma primária (TASK-66; a migration 0010
        // faz o backfill das páginas antigas). `is_primary=true` marca o corpo;
        // fica fora do tab bar (a UI a esconde) e não é renomeável/removível.
        return ctx.db.transaction((tx) => {
          // Slug derivado nunca falha o usuário: se colidir na seção, sufixa
          // -2, -3, … até um livre. Slug digitado mantém o CONFLICT (catch).
          let finalSlug = slug!;
          if (isDerived) {
            const taken = new Set(
              tx
                .select({ slug: pages.slug })
                .from(pages)
                .where(eq(pages.sectionId, input.sectionId))
                .all()
                .map((p) => p.slug),
            );
            if (taken.has(finalSlug)) {
              let n = 2;
              while (taken.has(`${slug}-${n}`)) n++;
              finalSlug = `${slug}-${n}`;
            }
          }

          const page = tx
            .insert(pages)
            .values({
              sectionId: input.sectionId,
              titulo: input.titulo,
              slug: finalSlug,
              ordem: (row?.maxOrdem ?? -1) + 1,
            })
            .returning()
            .get();
          tx.insert(tabs)
            .values({ pageId: page.id, titulo: 'Conteúdo', ordem: 0, isPrimary: true })
            .run();
          return page;
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw slugConflict();
        throw error;
      }
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const updated = ctx.db
        .update(pages)
        .set({ titulo: input.titulo })
        .where(eq(pages.id, input.id))
        .returning()
        .get();
      if (!updated) throw pageNotFound();
      return updated;
    }),

  updateSlug: protectedProcedure
    .input(z.object({ id: z.string(), slug: slugSchema }))
    .mutation(({ ctx, input }) => {
      try {
        const updated = ctx.db
          .update(pages)
          .set({ slug: input.slug })
          .where(eq(pages.id, input.id))
          .returning()
          .get();
        if (!updated) throw pageNotFound();
        return updated;
      } catch (error) {
        if (isUniqueViolation(error)) throw slugConflict();
        throw error;
      }
    }),

  reorder: protectedProcedure
    .input(z.object({ sectionId: z.string(), orderedIds: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      const existing = ctx.db
        .select({ id: pages.id })
        .from(pages)
        .where(eq(pages.sectionId, input.sectionId))
        .all();
      assertCompleteReorder(
        existing.map((p) => p.id),
        input.orderedIds,
      );
      ctx.db.transaction((tx) => {
        input.orderedIds.forEach((id, ordem) => {
          tx.update(pages)
            .set({ ordem })
            .where(and(eq(pages.id, id), eq(pages.sectionId, input.sectionId)))
            .run();
        });
      });
      return { ok: true };
    }),

  // Mesmo cascade das sections: tabs (e blocks/revisions) caem via FK.
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const deleted = ctx.db
      .delete(pages)
      .where(eq(pages.id, input.id))
      .returning({ id: pages.id })
      .get();
    if (!deleted) throw pageNotFound();
    return { ok: true };
  }),

  // Único lugar do MVP que cria uma revisão (nota da TASK-34) — snapshota
  // todas as tabs/blocks atuais da página. `autorId` vem do contexto, nunca
  // do client. O read path público (TASK-50) deve ler daqui, não de `blocks`
  // — ver ordering dependency documentada no spec da TASK-34.
  publish: protectedProcedure
    .input(z.object({ pageId: z.string(), mensagem: z.string().optional() }))
    .mutation(({ ctx, input }) => {
      const page = ctx.db.select({ id: pages.id }).from(pages).where(eq(pages.id, input.pageId)).get();
      if (!page) throw pageNotFound();

      return createRevision(ctx.db, {
        pageId: input.pageId,
        autorId: ctx.user.userId,
        mensagem: input.mensagem,
      });
    }),

  // Restaura o snapshot de uma revisão passada como conteúdo atual da página
  // (TASK-36) e encadeia uma nova revisão registrando o restore — histórico
  // append-only, nunca reescreve o passado. Tabs do snapshot que não existem
  // mais são puladas (não é erro) e reportadas em `skippedTabIds`.
  restoreRevision: protectedProcedure
    .input(z.object({ pageId: z.string(), revisionId: z.string() }))
    .mutation(({ ctx, input }) => {
      const page = ctx.db.select({ id: pages.id }).from(pages).where(eq(pages.id, input.pageId)).get();
      if (!page) throw pageNotFound();

      const targetRevision = ctx.db
        .select()
        .from(revisions)
        .where(and(eq(revisions.id, input.revisionId), eq(revisions.pageId, input.pageId)))
        .get();
      if (!targetRevision) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Revisão não encontrada nesta página' });
      }

      return restoreRevision(ctx.db, {
        pageId: input.pageId,
        targetRevision,
        autorId: ctx.user.userId,
      });
    }),

  /**
   * Resolve `sectionSlug`/`pageSlug` para o conteúdo publicado da página, para
   * a rota `/docs/:sectionSlug/:pageSlug` (TASK-52). publicProcedure, sem auth.
   *
   * Retorna `null` se a seção/página não existir (→ 404 na doc). Se a página
   * existir mas nunca foi publicada, `snapshot` vem `null` (→ estado "não
   * publicada"). O snapshot é o da última revisão — mesma ordenação/desempate
   * do `revisions.getLatestPublished`.
   */
  getPublishedBySlug: publicProcedure
    .input(z.object({ sectionSlug: z.string(), pageSlug: z.string() }))
    .query(({ ctx, input }) => {
      const page = ctx.db
        .select({ id: pages.id, titulo: pages.titulo })
        .from(pages)
        .innerJoin(sections, eq(sections.id, pages.sectionId))
        .where(and(eq(sections.slug, input.sectionSlug), eq(pages.slug, input.pageSlug)))
        .get();
      if (!page) return null;

      const rev = ctx.db
        .select({ snapshotJson: revisions.snapshotJson })
        .from(revisions)
        .where(eq(revisions.pageId, page.id))
        .orderBy(desc(revisions.criadoEm), desc(sql`${revisions}.rowid`))
        .limit(1)
        .get();

      return {
        pageId: page.id,
        titulo: page.titulo,
        snapshot: rev ? (JSON.parse(rev.snapshotJson) as PageSnapshot) : null,
      };
    }),
});
