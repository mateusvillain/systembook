import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { loadTokenSet } from '@systembook/content/tokens';
import { activeUploadToken, parseBearer } from '../auth/uploadTokens.js';
import type { Db } from '../db/client.js';
import { insertTokenSet } from '../db/tokenSets.js';
import { sendJson } from '../http/json.js';

/**
 * POST /api/tokens — publicação dos design tokens pelo CI (SYS-142), com o
 * `systembook tokens` (SYS-144). Fora do tRPC como o `POST /api/previews`:
 * auth por token de upload (escopo `tokens`), não sessão.
 *
 * Corpo JSON: `{ commitSha, sources: [{ file, content, mode? }] }` — os
 * arquivos DTCG como estão no repositório (`TokenSource`). O server roda o
 * mesmo pipeline do build estático (`loadTokenSet`, de
 * `@systembook/content/tokens`) e só grava se não houver erro: tokens
 * inválidos não chegam à doc. Avisos não barram e voltam na resposta.
 *
 * Respostas: 201 gravado · 400 corpo inválido · 401 sem token, desconhecido
 * ou revogado · 403 token de outro escopo · 413 corpo grande demais · 422
 * diagnósticos de erro (todos, de uma vez) · 500 falha interna.
 *
 * Um upload válido sem nenhum token (os arquivos existem, mas vazios) grava
 * e tira os tokens da doc — `tokens.getLatest` devolve `null` —, como o build
 * estático faz com um repositório sem tokens. Arquivo ausente ou glob sem
 * casamento é problema de configuração e a CLI barra antes de enviar.
 */

export interface TokensUploadDeps {
  db: Db;
  /** Default 10 MB. */
  maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

const payloadSchema = z.object({
  commitSha: z.string().trim().min(1),
  sources: z
    .array(
      z.object({
        file: z.string().min(1),
        content: z.string(),
        mode: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

/**
 * O corpo inteiro, ou `null` se passar do limite. Passado o limite, o resto
 * ainda é lido (e descartado) até o fim: parar no meio destruiria o socket, e
 * o cliente veria a conexão cair em vez do 413.
 */
async function readBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= maxBytes) chunks.push(chunk);
  }
  return size > maxBytes ? null : Buffer.concat(chunks).toString('utf8');
}

export async function handleTokensUpload(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TokensUploadDeps,
): Promise<void> {
  // Auth antes do corpo — token inválido não ganha parse.
  const bearer = parseBearer(req.headers);
  const scope = bearer ? activeUploadToken(deps.db, bearer)?.escopo : null;
  if (!scope) {
    sendJson(res, 401, { error: 'token de upload ausente, inválido ou revogado' });
    return;
  }
  if (scope !== 'tokens') {
    sendJson(res, 403, { error: `token de escopo "${scope}"; esta rota exige um token de escopo "tokens"` });
    return;
  }

  const maxBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) {
    // Recusa sem ler; `Connection: close` porque o corpo não vai ser consumido.
    res.setHeader('connection', 'close');
    sendJson(res, 413, { error: 'corpo grande demais' });
    return;
  }

  try {
    const raw = await readBody(req, maxBytes);
    if (raw === null) {
      sendJson(res, 413, { error: 'corpo grande demais' });
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { error: 'corpo não é JSON válido' });
      return;
    }
    const payload = payloadSchema.safeParse(json);
    if (!payload.success) {
      sendJson(res, 400, { error: 'esperado { commitSha, sources: [{ file, content, mode? }] }', issues: payload.error.issues });
      return;
    }

    const { set, diagnostics } = loadTokenSet(payload.data.sources);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    const warnings = diagnostics.filter((d) => d.severity === 'warning');
    if (errors.length) {
      sendJson(res, 422, { error: 'tokens inválidos', diagnostics: errors, warnings });
      return;
    }

    const published = insertTokenSet(deps.db, { commitSha: payload.data.commitSha, tokenSet: set });
    sendJson(res, 201, {
      id: published.id,
      commitSha: published.commitSha,
      modes: set.modes,
      tokens: set.tokens.length,
      warnings,
    });
  } catch {
    // Conexão abortada no meio do corpo, ou falha ao gravar. Nunca ecoar
    // detalhes internos (ou o token), como no upload de previews.
    if (!res.headersSent) sendJson(res, 500, { error: 'erro interno ao processar o upload' });
  }
}
