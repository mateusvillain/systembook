import { createReadStream, existsSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Servidor de estáticos mínimo para o build do painel admin (princípio do
 * container único — sem nginx). Em produção a imagem define ADMIN_DIST;
 * em dev local o painel roda via `vite dev`, então o fallback é opcional.
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export function resolveAdminDist(): string | null {
  const dir = process.env.ADMIN_DIST ?? path.join(packageRoot, '..', 'admin', 'dist');
  return existsSync(path.join(dir, 'index.html')) ? dir : null;
}

export function serveStatic(adminDist: string, urlPath: string, res: ServerResponse): void {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(adminDist, safePath);

  if (!filePath.startsWith(adminDist)) {
    res.writeHead(403).end();
    return;
  }

  // SPA fallback: rotas do painel caem no index.html
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(adminDist, 'index.html');
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}
