import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * `fetch` de teste que serve os arquivos de `dir` sob o prefixo de URL
 * `prefix`, como um host estático: arquivo inexistente responde 404 — ou, com
 * `spaFallback`, 200 com HTML, como os hosts com fallback de SPA. Registra as
 * URLs pedidas em `requests`.
 */
export function fsFetch(dir: string, prefix: string, { spaFallback = false } = {}) {
  const requests: string[] = [];
  const doFetch = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith(prefix)) {
      try {
        const body = await readFile(join(dir, url.slice(prefix.length)), 'utf8');
        return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
      } catch {
        // cai no "não encontrado" abaixo
      }
    }
    return spaFallback
      ? new Response('<!doctype html><title>SPA</title>', { status: 200, headers: { 'content-type': 'text/html' } })
      : new Response('not found', { status: 404 });
  };
  return Object.assign(doFetch as typeof fetch, { requests });
}

/** Escreve os arquivos de `siteDataFiles` num diretório temporário; devolve o caminho e a limpeza. */
export function writeSiteDataDir(files: Map<string, string>): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'systembook-data-'));
  for (const [path, json] of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), json);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
