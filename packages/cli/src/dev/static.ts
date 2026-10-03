import { createReadStream, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
};

/** Responde com um arquivo do disco, sem cache (ele muda a cada save). */
export function sendFile(res: ServerResponse, file: string): void {
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return notFound(res);
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  createReadStream(file).pipe(res);
}

/** Responde com um JSON da memória, sem cache. */
export function sendJson(res: ServerResponse, json: string): void {
  res.setHeader('Content-Type', MIME['.json']!);
  res.setHeader('Cache-Control', 'no-store');
  res.end(json);
}

export function notFound(res: ServerResponse): void {
  res.statusCode = 404;
  res.end('Not found');
}
