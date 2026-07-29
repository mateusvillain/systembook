import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { PageSnapshot } from '@systembook/schema';
import type { Db } from '../../db/client.js';
import { isUniqueViolation } from '../../db/errors.js';
import { createRevision, restoreRevision } from '../../db/revisions.js';
import { menus, pages, revisions, sections, statusTags, tabs } from '../../db/schema.js';
import { protectedProcedure, publicProcedure, router } from '../init.js';
import { assertCompleteReorder } from './reorder.js';

// Schema único de slug compartilhado por create e updateSlug — as regras não
// podem divergir com o tempo (nota da TASK-20).
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be lowercase and hyphenated (e.g. my-slug)');

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
  return new TRPCError({ code: 'CONFLICT', message: 'A page with this slug already exists in the section' });
}

function pageNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Page not found' });
}

/** Path de `/docs` já na forma canônica `menu/section/page[/tab]` (SYS-37). */
export interface PublicPathResolution {
  menuSlug: string;
  sectionSlug: string;
  pageSlug: string;
  tabId: string | null;
}

/**
 * Localiza uma página pelos slugs de menu + seção + página. `null` quando
 * qualquer um dos três não casa — inclusive quando a seção existe mas está
 * sob outro menu.
 */
function resolveCanonicalPath(
  db: Db,
  menuSlug: string,
  sectionSlug: string,
  pageSlug: string,
  tabId: string | null,
): PublicPathResolution | null {
  const row = db
    .select({ menuSlug: menus.slug, menuId: menus.id })
    .from(pages)
    .innerJoin(sections, eq(sections.id, pages.sectionId))
    .innerJoin(menus, eq(menus.id, sections.menuId))
    .where(and(eq(menus.slug, menuSlug), eq(sections.slug, sectionSlug), eq(pages.slug, pageSlug)))
    .get();
  if (!row) return null;
  return { menuSlug: row.menuSlug ?? row.menuId, sectionSlug, pageSlug, tabId };
}

/**
 * Forma legada `section/page[/tab]`: o menu não estava na URL, então é
 * derivado da própria seção (a hierarquia é 1:N estrita — uma seção pertence
 * a exatamente um menu), produzindo o path canônico para o redirect.
 */
function resolveLegacyPath(
  db: Db,
  sectionSlug: string,
  pageSlug: string,
  tabId: string | null,
): PublicPathResolution | null {
  const row = db
    .select({ menuSlug: menus.slug, menuId: menus.id })
    .from(pages)
    .innerJoin(sections, eq(sections.id, pages.sectionId))
    .innerJoin(menus, eq(menus.id, sections.menuId))
    .where(and(eq(sections.slug, sectionSlug), eq(pages.slug, pageSlug)))
    .get();
  if (!row) return null;
  return { menuSlug: row.menuSlug ?? row.menuId, sectionSlug, pageSlug, tabId };
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
        pageSubtitulo: pages.subtitulo,
        pageStatusTagId: pages.statusTagId,
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
      page: {
        id: row.pageId,
        titulo: row.pageTitulo,
        subtitulo: row.pageSubtitulo,
        statusTagId: row.pageStatusTagId,
      },
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
      if (!section) throw new TRPCError({ code: 'NOT_FOUND', message: 'Section not found' });

      const isDerived = input.slug === undefined;
      let slug = input.slug;
      if (isDerived) {
        const base = slugify(input.titulo);
        if (!base) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'The title does not produce a valid slug — provide one manually.',
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

  // Subtítulo/introdução opcional da página (TASK-99). String vazia → null,
  // para a UI voltar ao placeholder "Add an introduction (optional)".
  setSubtitulo: protectedProcedure
    .input(z.object({ id: z.string(), subtitulo: z.string() }))
    .mutation(({ ctx, input }) => {
      const subtitulo = input.subtitulo.trim() || null;
      const updated = ctx.db
        .update(pages)
        .set({ subtitulo })
        .where(eq(pages.id, input.id))
        .returning()
        .get();
      if (!updated) throw pageNotFound();
      return updated;
    }),

  // Atribui/limpa a tag de status da página (TASK-106). `statusTagId: null`
  // desvincula. Valida a existência da tag (a FK já garante integridade, mas
  // um NOT_FOUND explícito dá mensagem melhor que o erro cru da constraint).
  setStatusTag: protectedProcedure
    .input(z.object({ pageId: z.string(), statusTagId: z.string().nullable() }))
    .mutation(({ ctx, input }) => {
      if (input.statusTagId !== null) {
        const tag = ctx.db
          .select({ id: statusTags.id })
          .from(statusTags)
          .where(eq(statusTags.id, input.statusTagId))
          .get();
        if (!tag) throw new TRPCError({ code: 'NOT_FOUND', message: 'Status tag not found' });
      }
      const updated = ctx.db
        .update(pages)
        .set({ statusTagId: input.statusTagId })
        .where(eq(pages.id, input.pageId))
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

  // Move uma página para outra seção (TASK-109) — a única forma de trocar o
  // `sectionId` de uma página (o `reorder` só reordena dentro do mesmo pai).
  // Tabs/blocks/revisions seguem via `pageId` (inalterado). A ordem vira o fim
  // da seção destino; o slug é resolvido contra o unique (sectionId, slug) do
  // destino — se colidir, sufixa -2, -3, … como o `create` derivado.
  move: protectedProcedure
    .input(z.object({ pageId: z.string(), targetSectionId: z.string() }))
    .mutation(({ ctx, input }) => {
      const page = ctx.db
        .select({ id: pages.id, sectionId: pages.sectionId, slug: pages.slug })
        .from(pages)
        .where(eq(pages.id, input.pageId))
        .get();
      if (!page) throw pageNotFound();

      const target = ctx.db
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.id, input.targetSectionId))
        .get();
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Target section not found' });

      // Mover para a própria seção não faz nada (evita renumerar à toa).
      if (page.sectionId === input.targetSectionId) return { ok: true };

      return ctx.db.transaction((tx) => {
        const taken = new Set(
          tx
            .select({ slug: pages.slug })
            .from(pages)
            .where(eq(pages.sectionId, input.targetSectionId))
            .all()
            .map((p) => p.slug),
        );
        let slug = page.slug;
        if (taken.has(slug)) {
          let n = 2;
          while (taken.has(`${page.slug}-${n}`)) n++;
          slug = `${page.slug}-${n}`;
        }
        const row = tx
          .select({ maxOrdem: max(pages.ordem) })
          .from(pages)
          .where(eq(pages.sectionId, input.targetSectionId))
          .get();
        tx.update(pages)
          .set({ sectionId: input.targetSectionId, slug, ordem: (row?.maxOrdem ?? -1) + 1 })
          .where(eq(pages.id, input.pageId))
          .run();
        return { ok: true };
      });
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
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Revision not found on this page' });
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
    .input(
      z.object({
        // SYS-37: opcional porque a URL canônica passou a ter o menu
        // (`/docs/:menuSlug/:sectionSlug/:pageSlug`), mas o slug da seção
        // continua sendo único globalmente — sem `menuSlug` a resolução é a
        // de antes. Quando vem, é **validado**: um menu que não contém a
        // seção resolve para `null` (404), em vez de servir a mesma página
        // sob endereços diferentes.
        menuSlug: z.string().optional(),
        sectionSlug: z.string(),
        pageSlug: z.string(),
      }),
    )
    .query(({ ctx, input }) => {
      const page = ctx.db
        .select({ id: pages.id, titulo: pages.titulo, subtitulo: pages.subtitulo })
        .from(pages)
        .innerJoin(sections, eq(sections.id, pages.sectionId))
        .innerJoin(menus, eq(menus.id, sections.menuId))
        .where(
          and(
            eq(sections.slug, input.sectionSlug),
            eq(pages.slug, input.pageSlug),
            ...(input.menuSlug ? [eq(menus.slug, input.menuSlug)] : []),
          ),
        )
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
        subtitulo: page.subtitulo,
        snapshot: rev ? (JSON.parse(rev.snapshotJson) as PageSnapshot) : null,
      };
    }),

  /**
   * Canonicaliza um path de `/docs` (SYS-37). Existe para que **nenhum link
   * publicado antes do menu entrar na URL quebre**: a doc pública redireciona
   * o que este resolvedor devolver.
   *
   * O único caso genuinamente ambíguo é o de 3 segmentos, que tanto pode ser
   * a forma nova `menu/section/page` quanto a antiga `section/page/tab`. A
   * desambiguação é por dado, não por heurística de string: tenta a leitura
   * canônica primeiro e só cai na legada se ela não resolver. Com 4 segmentos
   * só a forma nova existe; com 2, só a antiga.
   *
   * Não exige publicação — mesmo critério de `getPublishedBySlug`, que
   * distingue "não existe" (null) de "existe mas nunca publicada".
   */
  resolvePublicPath: publicProcedure
    .input(z.object({ segments: z.array(z.string()).min(2).max(4) }))
    .query(({ ctx, input }): PublicPathResolution | null => {
      const [a, b, c, d] = input.segments;
      switch (input.segments.length) {
        case 2:
          return resolveLegacyPath(ctx.db, a!, b!, null);
        case 3:
          return (
            resolveCanonicalPath(ctx.db, a!, b!, c!, null) ?? resolveLegacyPath(ctx.db, a!, b!, c!)
          );
        default:
          return resolveCanonicalPath(ctx.db, a!, b!, c!, d!);
      }
    }),
});
