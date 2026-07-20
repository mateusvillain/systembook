import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { uploadTokens } from '../db/schema.js';

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
 * TASK-43) para a linha ativa correspondente — null se desconhecido ou
 * revogado. Nunca logar o token recebido, nem em caso de erro.
 */
export function findActiveUploadToken(db: Db, rawToken: string): UploadTokenRow | null {
  const row = db
    .select()
    .from(uploadTokens)
    .where(and(eq(uploadTokens.tokenHash, hashUploadToken(rawToken)), isNull(uploadTokens.revogadoEm)))
    .get();
  return row ?? null;
}
