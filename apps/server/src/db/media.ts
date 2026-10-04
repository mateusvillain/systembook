import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db, DbTx } from './client.js';
import { media } from './schema.js';

/**
 * Imagens do conteúdo (SYS-112): a política de upload e o acesso à tabela
 * `media`. O serving HTTP fica em `media/serve.ts`, como o do logo.
 */

/** Prefixo das URLs públicas das imagens (`GET /api/media/<hash>`). */
export const MEDIA_URL_PREFIX = '/api/media/';

/** Tipos aceitos: os formatos de imagem que o navegador mostra num `<img>`. */
export const ALLOWED_MEDIA_MIMES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
] as const;

/** Teto por arquivo — imagem de documentação, não vídeo. */
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

/** Guarda a imagem (idempotente pelo hash) e devolve a URL pública dela. */
export function storeMedia(db: Db | DbTx, bytes: Buffer, mime: string): string {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  db.insert(media).values({ hash, mime, bytes }).onConflictDoNothing().run();
  return `${MEDIA_URL_PREFIX}${hash}`;
}

export function readMedia(db: Db, hash: string): { bytes: Buffer; mime: string } | null {
  const row = db.select().from(media).where(eq(media.hash, hash)).get();
  return row ? { bytes: Buffer.from(row.bytes), mime: row.mime } : null;
}
