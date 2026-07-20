import { TRPCError } from '@trpc/server';
import { asc, eq, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { pages, revisions, sections } from '../../db/schema.js';
import { generateUniqueSectionSlug } from '../../db/sections.js';
import { protectedProcedure, publicProcedure, router } from '../init.js';
import { assertCompleteReorder } from './reorder.js';

// Estrutura de navegação: admin E editor têm CRUD completo (decisão do PRD,
// TASK-24) — por isso protectedProcedure, não adminProcedure.
export const sectionsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(sections).orderBy(asc(sections.ordem), asc(sections.id)).all(),
  ),

  /**
   * Árvore de navegação da doc pública (TASK-52), sem auth. Retorna só as
   * seções que têm ao menos uma página **publicada** (com ≥1 revisão), cada
   * uma já com suas páginas publicadas aninhadas — um round-trip, sem N+1.
   * Nunca expõe rascunhos: uma página só aparece depois de publicada.
   *
   * Desvio deliberado do "sections.listPublic/pages.listPublicBySection" do
   * spec: a versão aninhada é a estrutura que a sidebar precisa e evita o
   * lazy-load por seção do painel admin.
   */
  listPublic: publicProcedure.query(({ ctx }) => {
    const publishedPages = ctx.db
      .select({
        id: pages.id,
        titulo: pages.titulo,
        slug: pages.slug,
        sectionId: pages.sectionId,
      })
      .from(pages)
      .where(sql`EXISTS (SELECT 1 FROM ${revisions} WHERE ${revisions.pageId} = ${pages.id})`)
      .orderBy(asc(pages.ordem), asc(pages.id))
      .all();

    const secs = ctx.db
      .select()
      .from(sections)
      .orderBy(asc(sections.ordem), asc(sections.id))
      .all();

    return secs
      .map((s) => ({
        id: s.id,
        titulo: s.titulo,
        // slug sempre presente pós-backfill; fallback defensivo ao id
        slug: s.slug ?? s.id,
        pages: publishedPages
          .filter((p) => p.sectionId === s.id)
          .map((p) => ({ id: p.id, titulo: p.titulo, slug: p.slug })),
      }))
      .filter((s) => s.pages.length > 0);
  }),

  create: protectedProcedure
    .input(z.object({ titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const row = ctx.db.select({ maxOrdem: max(sections.ordem) }).from(sections).get();
      return ctx.db
        .insert(sections)
        .values({
          titulo: input.titulo,
          // Slug estável gerado do título (TASK-52) — desambiguado se colidir.
          slug: generateUniqueSectionSlug(ctx.db, input.titulo),
          ordem: (row?.maxOrdem ?? -1) + 1,
        })
        .returning()
        .get();
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const updated = ctx.db
        .update(sections)
        .set({ titulo: input.titulo })
        .where(eq(sections.id, input.id))
        .returning()
        .get();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Seção não encontrada' });
      return updated;
    }),

  reorder: protectedProcedure
    .input(z.object({ orderedIds: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      const existing = ctx.db.select({ id: sections.id }).from(sections).all();
      assertCompleteReorder(
        existing.map((s) => s.id),
        input.orderedIds,
      );
      ctx.db.transaction((tx) => {
        input.orderedIds.forEach((id, ordem) => {
          tx.update(sections).set({ ordem }).where(eq(sections.id, id)).run();
        });
      });
      return { ok: true };
    }),

  // Cascade-delete de toda a subárvore (pages/tabs e, no futuro, blocks) via
  // FK — destrutivo e sem lixeira no MVP; a UI confirma antes (TASK-23).
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const deleted = ctx.db
      .delete(sections)
      .where(eq(sections.id, input.id))
      .returning({ id: sections.id })
      .get();
    if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Seção não encontrada' });
    return { ok: true };
  }),
});
