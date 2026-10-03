import { initTRPC, TRPCError } from '@trpc/server';
import { findMigrationTokenOwner } from '../auth/uploadTokens.js';
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
 * O token age em nome do admin que o gerou (`tokenOwnerId`); se ele foi
 * excluído ou deixou de ser admin, o token deixa de valer.
 */
export const migrationProcedure = publicProcedure.use(({ ctx, next }) => {
  const tokenOwnerId = ctx.apiToken ? findMigrationTokenOwner(ctx.db, ctx.apiToken) : null;
  if (!tokenOwnerId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Migration token missing, invalid or revoked' });
  }
  return next({ ctx: { ...ctx, tokenOwnerId } });
});
