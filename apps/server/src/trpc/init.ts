import { initTRPC, TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { findActiveUploadToken } from '../auth/uploadTokens.js';
import { users } from '../db/schema.js';
import type { TrpcContext } from './context.js';

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Ponto único de enforcement de autenticação para todas as rotas protegidas. */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});

/**
 * Rotas de migração entre modos (SYS-110): autenticadas por token de escopo
 * `migration` no header `Authorization`, não por sessão — quem chama é o CLI.
 * `tokenOwnerId` é o admin que gerou o token (ou `null` se ele foi excluído).
 */
export const migrationProcedure = publicProcedure.use(({ ctx, next }) => {
  const token = ctx.apiToken ? findActiveUploadToken(ctx.db, ctx.apiToken, 'migration') : null;
  if (!token) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Migration token missing, invalid or revoked' });
  }
  const owner = token.criadoPor
    ? ctx.db.select({ id: users.id }).from(users).where(eq(users.id, token.criadoPor)).get()
    : undefined;
  return next({ ctx: { ...ctx, tokenOwnerId: owner?.id ?? null } });
});
