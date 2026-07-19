import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { clearSessionCookie, sessionCookie, SESSION_MAX_AGE_SECONDS } from '../../auth/cookies.js';
import { hashPassword, needsRehash, verifyPassword } from '../../auth/password.js';
import { sessions, users, memberships } from '../../db/schema.js';
import { protectedProcedure, publicProcedure, router } from '../init.js';

// Mesma mensagem para email desconhecido e senha errada — evita enumeração de usuários.
const invalidCredentials = () =>
  new TRPCError({ code: 'UNAUTHORIZED', message: 'Credenciais inválidas' });

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.db.select().from(users).where(eq(users.email, input.email)).get();
      if (!user) throw invalidCredentials();

      const valid = await verifyPassword(input.password, user.senhaHash);
      if (!valid) throw invalidCredentials();

      // Migração transparente dos hashes scrypt provisórios (pré-TASK-9)
      if (needsRehash(user.senhaHash)) {
        const upgraded = await hashPassword(input.password);
        ctx.db.update(users).set({ senhaHash: upgraded }).where(eq(users.id, user.id)).run();
      }

      const membership = ctx.db
        .select({ role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, user.id))
        .get();
      if (!membership) throw invalidCredentials();

      const session = ctx.db
        .insert(sessions)
        .values({
          userId: user.id,
          expiraEm: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
        })
        .returning({ id: sessions.id })
        .get();

      ctx.res?.setHeader('Set-Cookie', sessionCookie(session.id));

      return { userId: user.id, role: membership.role };
    }),

  logout: protectedProcedure.mutation(({ ctx }) => {
    ctx.db.delete(sessions).where(eq(sessions.id, ctx.user.sessionId)).run();
    ctx.res?.setHeader('Set-Cookie', clearSessionCookie());
    return { ok: true };
  }),

  me: publicProcedure.query(({ ctx }) =>
    ctx.user ? { userId: ctx.user.userId, role: ctx.user.role } : null,
  ),
});
