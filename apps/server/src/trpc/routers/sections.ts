import { TRPCError } from '@trpc/server';
import { asc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { sections } from '../../db/schema.js';
import { protectedProcedure, router } from '../init.js';
import { assertCompleteReorder } from './reorder.js';

// Estrutura de navegação: admin E editor têm CRUD completo (decisão do PRD,
// TASK-24) — por isso protectedProcedure, não adminProcedure.
export const sectionsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(sections).orderBy(asc(sections.ordem), asc(sections.id)).all(),
  ),

  create: protectedProcedure
    .input(z.object({ titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const row = ctx.db.select({ maxOrdem: max(sections.ordem) }).from(sections).get();
      return ctx.db
        .insert(sections)
        .values({ titulo: input.titulo, ordem: (row?.maxOrdem ?? -1) + 1 })
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
