import type { ServerResponse } from 'node:http';
import type { Db } from '../db/client.js';
import { MEDIA_URL_PREFIX, readMedia } from '../db/media.js';

/**
 * Imagens do conteúdo (SYS-112), servidas em `GET /api/media/<hash>`. Mesma
 * política do logo (`logo/serve.ts`): a URL leva o hash do conteúdo, então é
 * imutável e cacheável para sempre; e o SVG sai travado por CSP + `sandbox`,
 * para não virar vetor de XSS se a URL for aberta direto.
 */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** O hash de `/api/media/<hash>`; `null` quando o path não é de media. */
export function parseMediaPath(pathname: string): string | null {
  if (!pathname.startsWith(MEDIA_URL_PREFIX)) return null;
  const hash = pathname.slice(MEDIA_URL_PREFIX.length);
  return /^[0-9a-f]{32}$/.test(hash) ? hash : null;
}

export function handleMediaRequest(res: ServerResponse, db: Db, hash: string): void {
  const file = readMedia(db, hash);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': file.mime,
    'content-length': file.bytes.length,
    'cache-control': IMMUTABLE_CACHE,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  res.end(file.bytes);
}
