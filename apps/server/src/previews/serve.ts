import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { resolvePreviewPath } from './paths.js';

/**
 * GET /previews/<component>/<variant>/<commitSha>/<...arquivo> (TASK-46) —
 * serve os artefatos estáticos gravados pelo upload da TASK-43, para uso como
 * `src` de iframe no editor (TASK-47) e na doc pública.
 *
 * **Sem autenticação por decisão**: preview é conteúdo público, igual à
 * documentação publicada.
 *
 * Cada path carrega o `commitSha`, então o conteúdo é imutável — cache longo.
 *
 * **CORS aberto (`Access-Control-Allow-Origin: *`)**: o editor embute o preview
 * num `<iframe sandbox="allow-scripts">` (TASK-47), sem `allow-same-origin`, o
 * que dá ao iframe uma **origem opaca**. Scripts `type="module"` são sempre
 * buscados em modo CORS; de uma origem opaca (`Origin: null`) o browser exige
 * `Access-Control-Allow-Origin` no asset, senão bloqueia o bundle e o iframe
 * fica em branco. O artefato já é público e sem segredos, então liberar CORS é
 * seguro e necessário para o preview funcionar dentro do sandbox.
 */

export const PREVIEWS_URL_PREFIX = '/previews/';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

function sendError(res: ServerResponse, status: number, error: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error }));
}

export interface PreviewServeDeps {
  previewsRoot: string;
}

/**
 * `urlPath` é o pathname completo do request (já sabido que começa com
 * `/previews/`). Só GET/HEAD; qualquer outro método é 405.
 */
export async function handlePreviewRequest(
  method: string | undefined,
  urlPath: string,
  res: ServerResponse,
  deps: PreviewServeDeps,
): Promise<void> {
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }

  const rest = decodeSafe(urlPath.slice(PREVIEWS_URL_PREFIX.length));
  if (rest === null) {
    sendError(res, 400, 'caminho inválido');
    return;
  }

  const segments = rest.split('/').filter((s) => s.length > 0);
  const filePath = resolvePreviewPath(deps.previewsRoot, segments);
  if (!filePath) {
    sendError(res, 400, 'caminho inválido');
    return;
  }

  let target = filePath;
  let stats;
  try {
    stats = await stat(target);
    if (stats.isDirectory()) {
      // conveniência: `<entryDir>/` serve o index.html do artefato
      target = path.join(target, 'index.html');
      stats = await stat(target);
    }
    if (!stats.isFile()) throw new Error('não é arquivo');
  } catch {
    sendError(res, 404, 'artefato de preview não encontrado');
    return;
  }

  res.writeHead(200, {
    'content-type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': String(stats.size),
    'cache-control': IMMUTABLE_CACHE,
    // ver docblock: o iframe sandbox de origem opaca busca os módulos via CORS
    'access-control-allow-origin': '*',
  });

  if (method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(target).pipe(res);
}

/** `%xx` malformado joga no `decodeURIComponent` — vira 400, não 500. */
function decodeSafe(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
