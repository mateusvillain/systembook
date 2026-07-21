import { TRPCError } from '@trpc/server';
import { and, asc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { pages, tabs } from '../../db/schema.js';
import { protectedProcedure, router } from '../init.js';
import { assertCompleteReorder } from './reorder.js';

function tabNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Tab não encontrada' });
}

// Estruturalmente idêntico a pages.ts, menos slug (nota da TASK-22).
//
// Este router opera só sobre as tabs de **usuário** (is_primary=false). A tab
// primária é o corpo da página (TASK-65/66): fica fora da listagem, do espaço
// de ordenação (user tabs seguem 0-based ignorando a primária) e é protegida
// de rename/delete — o `eq(isPrimary, false)` nos where's garante que um id de
// primária cai em `tabNotFound()`, nunca alterando/removendo o corpo.
export const tabsRouter = router({
  listByPage: protectedProcedure.input(z.object({ pageId: z.string() })).query(({ ctx, input }) =>
    ctx.db
      .select()
      .from(tabs)
      .where(and(eq(tabs.pageId, input.pageId), eq(tabs.isPrimary, false)))
      .orderBy(asc(tabs.ordem), asc(tabs.id))
      .all(),
  ),

  // A tab primária (corpo da página, TASK-66/67). Fica fora de `listByPage`;
  // o editor do corpo a resolve por aqui. Toda página tem exatamente uma.
  getPrimary: protectedProcedure.input(z.object({ pageId: z.string() })).query(({ ctx, input }) => {
    const primary = ctx.db
      .select()
      .from(tabs)
      .where(and(eq(tabs.pageId, input.pageId), eq(tabs.isPrimary, true)))
      .get();
    if (!primary) throw new TRPCError({ code: 'NOT_FOUND', message: 'Página não encontrada' });
    return primary;
  }),

  create: protectedProcedure
    .input(z.object({ pageId: z.string(), titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const page = ctx.db
        .select({ id: pages.id })
        .from(pages)
        .where(eq(pages.id, input.pageId))
        .get();
      if (!page) throw new TRPCError({ code: 'NOT_FOUND', message: 'Página não encontrada' });

      const row = ctx.db
        .select({ maxOrdem: max(tabs.ordem) })
        .from(tabs)
        .where(and(eq(tabs.pageId, input.pageId), eq(tabs.isPrimary, false)))
        .get();
      return ctx.db
        .insert(tabs)
        .values({ pageId: input.pageId, titulo: input.titulo, ordem: (row?.maxOrdem ?? -1) + 1 })
        .returning()
        .get();
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const updated = ctx.db
        .update(tabs)
        .set({ titulo: input.titulo })
        .where(and(eq(tabs.id, input.id), eq(tabs.isPrimary, false)))
        .returning()
        .get();
      if (!updated) throw tabNotFound();
      return updated;
    }),

  reorder: protectedProcedure
    .input(z.object({ pageId: z.string(), orderedIds: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      const existing = ctx.db
        .select({ id: tabs.id })
        .from(tabs)
        .where(and(eq(tabs.pageId, input.pageId), eq(tabs.isPrimary, false)))
        .all();
      assertCompleteReorder(
        existing.map((t) => t.id),
        input.orderedIds,
      );
      ctx.db.transaction((tx) => {
        input.orderedIds.forEach((id, ordem) => {
          tx.update(tabs)
            .set({ ordem })
            .where(and(eq(tabs.id, id), eq(tabs.pageId, input.pageId), eq(tabs.isPrimary, false)))
            .run();
        });
      });
      return { ok: true };
    }),

  // Cascade para os blocks da tab. A primária não é removível (where filtra).
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const deleted = ctx.db
      .delete(tabs)
      .where(and(eq(tabs.id, input.id), eq(tabs.isPrimary, false)))
      .returning({ id: tabs.id })
      .get();
    if (!deleted) throw tabNotFound();
    return { ok: true };
  }),
});
