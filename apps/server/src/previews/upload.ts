import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import * as tar from 'tar';
import { findActiveUploadToken } from '../auth/uploadTokens.js';
import type { Db } from '../db/client.js';
import { insertComponentPreview } from '../db/componentPreviews.js';
import { isSafeSegment, resolvePreviewPath } from './paths.js';

/**
 * POST /api/previews — upload de artefato de preview pelo CI do time (PRD
 * 6.5). Deliberadamente FORA do tRPC (nota da TASK-43): corpo
 * multipart/binário e auth por token de CI (TASK-44), não sessão de usuário.
 *
 * Payload multipart/form-data:
 * - campos `component_name`, `variant_id`, `commit_sha` (antes do arquivo);
 * - arquivo `artifact`: tar.gz com o build da variante (TASK-41).
 *
 * O artefato é extraído em `<previewsRoot>/<component>/<variant>/<sha>/` —
 * re-upload do mesmo trio sobrescreve o mesmo path (idempotente); cada upload
 * insere uma linha nova em component_previews (histórico append-only).
 */

export interface PreviewUploadDeps {
  db: Db;
  previewsRoot: string;
  /** Default 50 MB. */
  maxArtifactBytes?: number;
}

const DEFAULT_MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

const REQUIRED_FIELDS = ['component_name', 'variant_id', 'commit_sha'] as const;
type FieldName = (typeof REQUIRED_FIELDS)[number];

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export async function handlePreviewUpload(
  req: IncomingMessage,
  res: ServerResponse,
  deps: PreviewUploadDeps,
): Promise<void> {
  // Auth primeiro, antes de tocar no corpo — token inválido não ganha parse.
  const authHeader = req.headers.authorization ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  const token = bearer ? findActiveUploadToken(deps.db, bearer) : null;
  if (!token) {
    sendJson(res, 401, { error: 'token de upload ausente, inválido ou revogado' });
    return;
  }

  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    sendJson(res, 400, { error: 'esperado multipart/form-data' });
    return;
  }

  const maxBytes = deps.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
  const tempDir = await mkdtemp(path.join(tmpdir(), 'systembook-upload-'));
  const tempArchive = path.join(tempDir, 'artifact.tar.gz');

  try {
    const parsed = await parseMultipart(req, contentType, tempArchive, maxBytes);
    if ('error' in parsed) {
      sendJson(res, 400, { error: parsed.error });
      return;
    }
    const { fields } = parsed;

    const missing = REQUIRED_FIELDS.filter((name) => !fields[name]);
    if (missing.length > 0) {
      sendJson(res, 400, { error: `campos obrigatórios ausentes: ${missing.join(', ')}` });
      return;
    }
    const unsafe = REQUIRED_FIELDS.filter((name) => !isSafeSegment(fields[name]!));
    if (unsafe.length > 0) {
      sendJson(res, 400, {
        error: `campos com valor inválido (só [A-Za-z0-9._-], sem começar com ponto): ${unsafe.join(', ')}`,
      });
      return;
    }

    const componentName = fields.component_name!;
    const variantId = fields.variant_id!;
    const commitSha = fields.commit_sha!;

    // Defesa em profundidade: mesmo com segmentos validados, o path final
    // precisa continuar dentro do previewsRoot (helper compartilhado com a
    // rota de leitura da TASK-46).
    const targetDir = resolvePreviewPath(deps.previewsRoot, [componentName, variantId, commitSha]);
    if (!targetDir) {
      sendJson(res, 400, { error: 'caminho de destino inválido' });
      return;
    }

    // Idempotência: mesmo trio → mesmo path, sobrescrito por completo.
    await rm(targetDir, { recursive: true, force: true });
    await mkdir(targetDir, { recursive: true });

    try {
      await tar.extract({
        file: tempArchive,
        cwd: targetDir,
        strict: true,
        // só arquivos e diretórios — symlinks/hardlinks do archive poderiam
        // apontar para fora do destino ('type' não existe no branch Stats do
        // union do tar, mas extração de archive sempre entrega ReadEntry)
        filter: (_entryPath, entry) =>
          'type' in entry && (entry.type === 'File' || entry.type === 'Directory'),
      });
    } catch {
      await rm(targetDir, { recursive: true, force: true });
      sendJson(res, 400, { error: 'artefato não é um tar.gz válido' });
      return;
    }

    const row = insertComponentPreview(deps.db, {
      componentName,
      variantId,
      commitSha,
      // relativo ao previewsRoot (posix) — o volume pode ser montado em outro
      // lugar sem invalidar as linhas; a rota da TASK-46 resolve contra o root
      pathEstatico: [componentName, variantId, commitSha].join('/'),
    });

    sendJson(res, 201, {
      id: row.id,
      componentName: row.componentName,
      variantId: row.variantId,
      commitSha: row.commitSha,
      pathEstatico: row.pathEstatico,
      publicadoEm: row.publicadoEm.toISOString(),
    });
  } catch {
    // Nunca ecoar detalhes internos (ou o token) na resposta/log de erro.
    sendJson(res, 500, { error: 'erro interno ao processar o upload' });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

type MultipartResult = { fields: Partial<Record<FieldName, string>> } | { error: string };

/**
 * Consome o multipart: campos em memória, arquivo `artifact` direto para
 * `tempArchive` (nunca em memória). `fileSize` do busboy trunca no limite —
 * truncado vira 400, não um artefato parcial.
 */
function parseMultipart(
  req: IncomingMessage,
  contentType: string,
  tempArchive: string,
  maxBytes: number,
): Promise<MultipartResult> {
  return new Promise((resolve, reject) => {
    const parser = busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: maxBytes, files: 1, fields: 10, fieldSize: 1024 },
    });

    const fields: Partial<Record<FieldName, string>> = {};
    let sawArtifact = false;
    let truncated = false;
    const writes: Promise<void>[] = [];

    parser.on('field', (name, value) => {
      if ((REQUIRED_FIELDS as readonly string[]).includes(name)) {
        fields[name as FieldName] = value;
      }
    });

    parser.on('file', (name, stream, _info) => {
      if (name !== 'artifact' || sawArtifact) {
        stream.resume(); // dreno: arquivo inesperado é ignorado
        return;
      }
      sawArtifact = true;
      stream.on('limit', () => {
        truncated = true;
      });
      writes.push(pipeline(stream, createWriteStream(tempArchive)));
    });

    parser.on('error', () => resolve({ error: 'multipart malformado' }));
    parser.on('close', () => {
      void Promise.all(writes)
        .then(() => {
          if (!sawArtifact) resolve({ error: 'arquivo "artifact" ausente no multipart' });
          else if (truncated) resolve({ error: 'artefato excede o tamanho máximo permitido' });
          else resolve({ fields });
        })
        .catch(reject);
    });

    req.pipe(parser);
  });
}
