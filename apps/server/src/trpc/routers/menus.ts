import { TRPCError } from '@trpc/server';
import { asc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { isUniqueViolation } from '../../db/errors.js';
import { generateUniqueMenuSlug } from '../../db/menus.js';
import { menus } from '../../db/schema.js';
import { protectedProcedure, router } from '../init.js';
import { assertCompleteReorder } from './reorder.js';

function menuNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Menu não encontrado' });
}

function menuSlugConflict(): TRPCError {
  return new TRPCError({ code: 'CONFLICT', message: 'Já existe um menu com este slug' });
}

// Estrutura de navegação: admin e editor têm o mesmo CRUD (TASK-24).
export const menusRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(menus).orderBy(asc(menus.ordem), asc(menus.id)).all(),
  ),

  create: protectedProcedure
    .input(z.object({ titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const row = ctx.db.select({ maxOrdem: max(menus.ordem) }).from(menus).get();
      try {
        return ctx.db
          .insert(menus)
          .values({
            titulo: input.titulo,
            slug: generateUniqueMenuSlug(ctx.db, input.titulo),
            ordem: (row?.maxOrdem ?? -1) + 1,
          })
          .returning()
          .get();
      } catch (error) {
        if (isUniqueViolation(error)) throw menuSlugConflict();
        throw error;
      }
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), titulo: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const updated = ctx.db
        .update(menus)
        .set({ titulo: input.titulo })
        .where(eq(menus.id, input.id))
        .returning()
        .get();
      if (!updated) throw menuNotFound();
      return updated;
    }),

  reorder: protectedProcedure
    .input(z.object({ orderedIds: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      const existing = ctx.db.select({ id: menus.id }).from(menus).all();
      assertCompleteReorder(
        existing.map((menu) => menu.id),
        input.orderedIds,
      );
      ctx.db.transaction((tx) => {
        input.orderedIds.forEach((id, ordem) => {
          tx.update(menus).set({ ordem }).where(eq(menus.id, id)).run();
        });
      });
      return { ok: true };
    }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const deleted = ctx.db.delete(menus).where(eq(menus.id, input.id)).returning({ id: menus.id }).get();
    if (!deleted) throw menuNotFound();
    return { ok: true };
  }),
});
