import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { InstanceExport, UnpublishedPageRef } from '@systembook/schema';
import { buildExportProject } from './project.js';

export interface ExportOptions {
  /** URL da instância CMS (`https://docs.acme.dev`). */
  from: string;
  /** Token de escopo `migration` (gerado em Settings → Tokens). */
  token: string;
  /** Pasta do projeto gerado. */
  out: string;
  /** Escreve numa pasta que já tem arquivos. */
  force?: boolean;
  /** Injetável nos testes. */
  fetch?: typeof fetch;
}

export interface ExportResult {
  out: string;
  files: number;
  pages: number;
  images: number;
  warnings: string[];
  unpublished: UnpublishedPageRef[];
}

/** Erro de uso ou de comunicação, com a mensagem pronta para o terminal. */
export class ExportError extends Error {}

/**
 * `systembook export` (SYS-111): converte uma instância CMS num projeto do
 * modo estático — `docs/` com `.mdx`, `_menu.yml`/`_section.yml`, a config e as
 * imagens. Só o conteúdo publicado vai; o que precisou ser simplificado volta
 * em `warnings`.
 */
export async function exportProject(options: ExportOptions): Promise<ExportResult> {
  const out = path.resolve(options.out);
  if (existsSync(out) && readdirSync(out).length && !options.force) {
    throw new ExportError(`${options.out} já existe e não está vazia — escolha outra pasta com --out ou use --force para escrever por cima.`);
  }

  const doFetch = options.fetch ?? fetch;
  let base: URL;
  try {
    base = new URL(options.from);
  } catch {
    throw new ExportError(`--from precisa ser a URL da instância (ex.: https://docs.acme.dev), não "${options.from}".`);
  }
  const data = await fetchExport(doFetch, base, options.token);
  const project = buildExportProject(data, { origin: base.href });

  const images: { path: string; content: Buffer }[] = [];
  for (const download of project.downloads) {
    const response = await doFetch(download.url).catch(() => null);
    if (!response?.ok) {
      project.warnings.push(`${download.path}: não foi possível baixar ${download.url}${response ? ` (HTTP ${response.status})` : ''}.`);
      continue;
    }
    images.push({ path: download.path, content: Buffer.from(await response.arrayBuffer()) });
  }

  for (const file of [...project.files, ...images]) {
    const target = path.join(out, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }

  return {
    out,
    files: project.files.length + images.length,
    pages: project.pages,
    images: images.length,
    warnings: project.warnings,
    unpublished: data.unpublished,
  };
}

async function fetchExport(doFetch: typeof fetch, base: URL, token: string): Promise<InstanceExport> {
  const url = new URL('trpc/migration.export', base.href.endsWith('/') ? base : `${base.href}/`);
  let response: Response;
  try {
    response = await doFetch(url, { headers: { authorization: `Bearer ${token}` } });
  } catch (error) {
    throw new ExportError(`não foi possível conectar a ${base.origin}: ${(error as Error).message}`);
  }
  if (response.status === 401) {
    throw new ExportError('a instância recusou o token — gere um token de escopo "Migration" em Settings → Tokens (como admin).');
  }
  if (response.status === 404) {
    throw new ExportError(`${base.href} não tem o export — confira a URL e atualize a instância para uma versão com o export (posterior à 0.3).`);
  }
  if (!response.ok) throw new ExportError(`a instância respondeu HTTP ${response.status} ao export.`);
  const body = (await response.json().catch(() => null)) as { result?: { data?: InstanceExport } } | null;
  const data = body?.result?.data;
  if (!data || data.version !== 1) {
    throw new ExportError('a resposta não é um export do SystemBook que este CLI entende — atualize o CLI e a instância para a mesma versão.');
  }
  return data;
}
