import type { ServerResponse } from 'node:http';

/** Resposta JSON das rotas HTTP fora do tRPC (uploads de previews e tokens). */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
