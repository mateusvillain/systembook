import { TRPCError } from '@trpc/server';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { PageSnapshot } from '@systembook/schema';
import { revisions, users } from '../../db/schema.js';
import { protectedProcedure, publicProcedure, router } from '../init.js';

function revisionNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Revisão não encontrada' });
}

export const revisionsRouter = router({
  // leftJoin (não innerJoin): autor_id é SET NULL no hard delete do usuário
  // (TASK-33/14) — a revisão sobrevive com autor "removido".
  listByPage: protectedProcedure
    .input(z.object({ pageId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db
        .select({
          id: revisions.id,
          criadoEm: revisions.criadoEm,
          mensagem: revisions.mensagem,
          autorId: revisions.autorId,
          autorEmail: users.email,
        })
        .from(revisions)
        .leftJoin(users, eq(users.id, revisions.autorId))
        .where(eq(revisions.pageId, input.pageId))
        // `criadoEm` tem resolução de segundo (unixepoch()) — publishes muito
        // próximos podem empatar; desempata pelo rowid (ordem de inserção).
        .orderBy(desc(revisions.criadoEm), desc(sql`${revisions}.rowid`))
        .all(),
    ),

  getById: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const row = ctx.db
      .select({
        id: revisions.id,
        pageId: revisions.pageId,
        criadoEm: revisions.criadoEm,
        mensagem: revisions.mensagem,
        autorId: revisions.autorId,
        autorEmail: users.email,
        snapshotJson: revisions.snapshotJson,
      })
      .from(revisions)
      .leftJoin(users, eq(users.id, revisions.autorId))
      .where(eq(revisions.id, input.id))
      .get();
    if (!row) throw revisionNotFound();

    const { snapshotJson, ...meta } = row;
    return { ...meta, snapshot: JSON.parse(snapshotJson) as PageSnapshot };
  }),

  /**
   * Superfície pública de documentação (TASK-50): o snapshot da **última
   * revisão publicada** da página — nunca o rascunho ao vivo de `blocks`
   * (concretiza a dependência de ordenação registrada na TASK-34).
   * `publicProcedure`: a doc publicada não exige autenticação. `null` quando a
   * página nunca foi publicada (sem revisões).
   */
  getLatestPublished: publicProcedure
    .input(z.object({ pageId: z.string() }))
    .query(({ ctx, input }) => {
      const row = ctx.db
        .select({ snapshotJson: revisions.snapshotJson })
        .from(revisions)
        .where(eq(revisions.pageId, input.pageId))
        // mesma ordenação/desempate do listByPage: última publicação primeiro
        .orderBy(desc(revisions.criadoEm), desc(sql`${revisions}.rowid`))
        .limit(1)
        .get();
      if (!row) return null;
      return JSON.parse(row.snapshotJson) as PageSnapshot;
    }),
});
