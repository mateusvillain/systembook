import { TRPCError } from '@trpc/server';
import { and, asc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { isUniqueViolation } from '../../db/errors.js';
import { createRevision, restoreRevision } from '../../db/revisions.js';
import { pages, revisions, sections } from '../../db/schema.js';
import { protectedProcedure, router } from '../init.js';
import { assertCompleteReorder } from './reorder.js';

// Schema único de slug compartilhado por create e updateSlug — as regras não
// podem divergir com o tempo (nota da TASK-20).
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug deve ser minúsculo e hifenizado (ex.: meu-slug)');

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

  create: protectedProcedure
    .input(z.object({ sectionId: z.string(), titulo: z.string().min(1), slug: slugSchema }))
    .mutation(({ ctx, input }) => {
      const section = ctx.db
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.id, input.sectionId))
        .get();
      if (!section) throw new TRPCError({ code: 'NOT_FOUND', message: 'Seção não encontrada' });

      const row = ctx.db
        .select({ maxOrdem: max(pages.ordem) })
        .from(pages)
        .where(eq(pages.sectionId, input.sectionId))
        .get();
      try {
        return ctx.db
          .insert(pages)
          .values({
            sectionId: input.sectionId,
            titulo: input.titulo,
            slug: input.slug,
            ordem: (row?.maxOrdem ?? -1) + 1,
          })
          .returning()
          .get();
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
});
