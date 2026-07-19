import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from '../../auth/password.js';
import { memberships, sessions, users } from '../../db/schema.js';
import { adminProcedure, router } from '../init.js';

const roleSchema = z.enum(['admin', 'editor']);

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

export const usersRouter = router({
  // Nunca inclui senha_hash na seleção
  list: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: users.id, nome: users.nome, email: users.email, role: memberships.role })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .all(),
  ),

  create: adminProcedure
    .input(
      z.object({
        nome: z.string().min(1),
        email: z.email(),
        password: z.string().min(8),
        role: roleSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const senhaHash = await hashPassword(input.password);
      try {
        return ctx.db.transaction((tx) => {
          const user = tx
            .insert(users)
            .values({ nome: input.nome, email: input.email, senhaHash })
            .returning({ id: users.id, nome: users.nome, email: users.email })
            .get();
          tx.insert(memberships).values({ userId: user.id, role: input.role }).run();
          return { ...user, role: input.role };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Já existe um usuário com este email' });
        }
        throw error;
      }
    }),

  update: adminProcedure
    .input(z.object({ userId: z.string(), role: roleSchema }))
    .mutation(({ ctx, input }) => {
      const updated = ctx.db
        .update(memberships)
        .set({ role: input.role })
        .where(eq(memberships.userId, input.userId))
        .returning({ userId: memberships.userId, role: memberships.role })
        .get();
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
      }
      return updated;
    }),

  // Decisão do MVP: hard delete (sessions/memberships caem via FK cascade).
  // Quando revisions existir, autor_id deve ser nullable/SET NULL (documentado na memória).
  deactivate: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(({ ctx, input }) => {
      if (input.userId === ctx.user.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Você não pode desativar a própria conta',
        });
      }
      const deleted = ctx.db
        .delete(users)
        .where(eq(users.id, input.userId))
        .returning({ id: users.id })
        .get();
      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
      }
      return { ok: true };
    }),

  resetPassword: adminProcedure
    .input(z.object({ userId: z.string(), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const senhaHash = await hashPassword(input.newPassword);
      const updated = ctx.db
        .update(users)
        .set({ senhaHash })
        .where(eq(users.id, input.userId))
        .returning({ id: users.id })
        .get();
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuário não encontrado' });
      }
      // Invalida todas as sessões do usuário — força re-login com a nova senha
      ctx.db.delete(sessions).where(eq(sessions.userId, input.userId)).run();
      return { ok: true };
    }),
});
