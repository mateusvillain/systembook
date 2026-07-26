import { TRPCError } from '@trpc/server';
import { asc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { statusTags } from '../../db/schema.js';
import { protectedProcedure, router } from '../init.js';
import { assertCompleteReorder } from './reorder.js';

// Cor no formato hex `#RRGGBB` — o seletor do painel e o seed usam esse formato.
const HEX_COLOR = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex #RRGGBB');

/**
 * CRUD das tags de status (TASK-105). Admin E editor gerenciam (protectedProcedure),
 * como o resto da estrutura de navegação — a fronteira é a mesma travada por
 * permissions.test.ts. Segue as convenções de sections/menus: `ordem`
 * incremental no create, reorder por lista completa, NOT_FOUND em id ausente.
 */
export const statusTagsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.select().from(statusTags).orderBy(asc(statusTags.ordem), asc(statusTags.id)).all(),
  ),

  create: protectedProcedure
    .input(z.object({ titulo: z.string().min(1), cor: HEX_COLOR }))
    .mutation(({ ctx, input }) => {
      const row = ctx.db.select({ maxOrdem: max(statusTags.ordem) }).from(statusTags).get();
      return ctx.db
        .insert(statusTags)
        .values({ titulo: input.titulo, cor: input.cor, ordem: (row?.maxOrdem ?? -1) + 1 })
        .returning()
        .get();
    }),

  // Renomear e/ou recolorir: ambos opcionais, mas ao menos um deve vir.
  update: protectedProcedure
    .input(
      z
        .object({
          id: z.string(),
          titulo: z.string().min(1).optional(),
          cor: HEX_COLOR.optional(),
        })
        .refine((v) => v.titulo !== undefined || v.cor !== undefined, {
          message: 'Provide a title and/or color',
        }),
    )
    .mutation(({ ctx, input }) => {
      const patch: { titulo?: string; cor?: string } = {};
      if (input.titulo !== undefined) patch.titulo = input.titulo;
      if (input.cor !== undefined) patch.cor = input.cor;
      const updated = ctx.db
        .update(statusTags)
        .set(patch)
        .where(eq(statusTags.id, input.id))
        .returning()
        .get();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Status tag not found' });
      return updated;
    }),

  reorder: protectedProcedure
    .input(z.object({ orderedIds: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => {
      const existing = ctx.db.select({ id: statusTags.id }).from(statusTags).all();
      assertCompleteReorder(
        existing.map((t) => t.id),
        input.orderedIds,
      );
      ctx.db.transaction((tx) => {
        input.orderedIds.forEach((id, ordem) => {
          tx.update(statusTags).set({ ordem }).where(eq(statusTags.id, id)).run();
        });
      });
      return { ok: true };
    }),

  // Hard delete. Páginas que apontavam para a tag têm `statusTagId` zerado pela
  // FK ON DELETE SET NULL (migration 0014) — deletar uma tag em uso não falha.
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const deleted = ctx.db
      .delete(statusTags)
      .where(eq(statusTags.id, input.id))
      .returning({ id: statusTags.id })
      .get();
    if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Status tag not found' });
    return { ok: true };
  }),
});
