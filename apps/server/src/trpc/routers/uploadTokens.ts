import { TRPCError } from '@trpc/server';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { generateUploadToken, hashUploadToken } from '../../auth/uploadTokens.js';
import { uploadTokens } from '../../db/schema.js';
import { adminProcedure, router } from '../init.js';

/**
 * Gestão de tokens de upload (TASK-44) — tudo adminProcedure de propósito:
 * um token dá escrita no conteúdo público de preview a partir de um processo
 * externo (CI), então editor não gerencia tokens (nota do spec).
 */
export const uploadTokensRouter = router({
  // Nunca expõe token_hash — só metadados.
  list: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: uploadTokens.id,
        label: uploadTokens.label,
        criadoEm: uploadTokens.criadoEm,
        revogadoEm: uploadTokens.revogadoEm,
      })
      .from(uploadTokens)
      .orderBy(desc(uploadTokens.criadoEm), desc(sql`${uploadTokens}.rowid`))
      .all(),
  ),

  create: adminProcedure
    .input(z.object({ label: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const token = generateUploadToken();
      const row = ctx.db
        .insert(uploadTokens)
        .values({ tokenHash: hashUploadToken(token), label: input.label })
        .returning({ id: uploadTokens.id, label: uploadTokens.label })
        .get();
      // Única resposta que carrega o token em claro — nunca é armazenado nem
      // recuperável depois (só o hash persiste).
      return { ...row, token };
    }),

  revoke: adminProcedure
    .input(z.object({ tokenId: z.string() }))
    .mutation(({ ctx, input }) => {
      const existing = ctx.db
        .select({ id: uploadTokens.id, revogadoEm: uploadTokens.revogadoEm })
        .from(uploadTokens)
        .where(eq(uploadTokens.id, input.tokenId))
        .get();
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Token não encontrado' });
      }
      // Idempotente: revogar de novo não move o timestamp original.
      if (existing.revogadoEm) {
        return { id: existing.id, revogadoEm: existing.revogadoEm };
      }
      const row = ctx.db
        .update(uploadTokens)
        .set({ revogadoEm: new Date() })
        .where(eq(uploadTokens.id, input.tokenId))
        .returning({ id: uploadTokens.id, revogadoEm: uploadTokens.revogadoEm })
        .get();
      return row;
    }),
});
