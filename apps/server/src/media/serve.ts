import { createHash } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { eq } from 'drizzle-orm';
import type { Db, DbTx } from '../db/client.js';
import { media } from '../db/schema.js';

/**
 * Imagens do conteúdo (SYS-112), guardadas em `media` e servidas em
 * `GET /api/media/<hash>`. Mesma política do logo (`logo/serve.ts`): a URL
 * leva o hash do conteúdo, então é imutável e cacheável para sempre; e o SVG
 * sai travado por CSP + `sandbox`, para não virar vetor de XSS se a URL for
 * aberta direto.
 */
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

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** Guarda a imagem (idempotente pelo hash) e devolve a URL pública dela. */
export function storeMedia(db: Db | DbTx, bytes: Buffer, mime: string): string {
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  db.insert(media).values({ hash, mime, bytes }).onConflictDoNothing().run();
  return `${MEDIA_URL_PREFIX}${hash}`;
}

/** O hash de `/api/media/<hash>`; `null` quando o path não é de media. */
export function parseMediaPath(pathname: string): string | null {
  if (!pathname.startsWith(MEDIA_URL_PREFIX)) return null;
  const hash = pathname.slice(MEDIA_URL_PREFIX.length);
  return /^[0-9a-f]{32}$/.test(hash) ? hash : null;
}

export function handleMediaRequest(res: ServerResponse, db: Db, hash: string): void {
  const row = db.select().from(media).where(eq(media.hash, hash)).get();
  if (!row) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const bytes = Buffer.from(row.bytes);
  res.writeHead(200, {
    'content-type': row.mime,
    'content-length': bytes.length,
    'cache-control': IMMUTABLE_CACHE,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  res.end(bytes);
}
