import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { IncomingHttpHeaders } from 'node:http';
import type { Db } from '../db/client.js';
import { memberships, uploadTokens, type TokenScope } from '../db/schema.js';

/**
 * Token de CI: 32 bytes aleatórios em base64url (~256 bits de entropia).
 * SHA-256 simples (não argon2) é o hash adequado aqui — diferente de senha,
 * o valor é aleatório de alta entropia, então brute-force offline do hash é
 * inviável e o custo de KDF só atrasaria cada request de upload.
 */
export function generateUploadToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashUploadToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type UploadTokenRow = typeof uploadTokens.$inferSelect;

/**
 * Resolve um token bruto (header Authorization do POST /api/previews,
 * TASK-43, ou das rotas de migração, SYS-110) para a linha ativa do escopo
 * pedido — null se desconhecido, revogado ou de outro escopo. Nunca logar o
 * token recebido, nem em caso de erro.
 */
export function findActiveUploadToken(db: Db, rawToken: string, escopo: TokenScope): UploadTokenRow | null {
  const row = db
    .select()
    .from(uploadTokens)
    .where(
      and(
        eq(uploadTokens.tokenHash, hashUploadToken(rawToken)),
        eq(uploadTokens.escopo, escopo),
        isNull(uploadTokens.revogadoEm),
      ),
    )
    .get();
  return row ?? null;
}

/** O token do header `Authorization: Bearer …`, ou `null`. */
export function parseBearer(headers: Pick<IncomingHttpHeaders, 'authorization'>): string | null {
  const header = headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

/**
 * Token de migração (SYS-110) válido **e** cujo criador ainda é admin — o
 * token age em nome dele (lê e escreve o conteúdo inteiro), então não pode
 * sobreviver à exclusão ou ao rebaixamento de quem o gerou. Devolve o id do
 * criador, ou `null`.
 */
export function findMigrationTokenOwner(db: Db, rawToken: string): string | null {
  const token = findActiveUploadToken(db, rawToken, 'migration');
  if (!token?.criadoPor) return null;
  const owner = db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.userId, token.criadoPor), eq(memberships.role, 'admin')))
    .get();
  return owner?.userId ?? null;
}
