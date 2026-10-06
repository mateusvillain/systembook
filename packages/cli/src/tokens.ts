import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { TokenSet } from '@systembook/schema';
import { formatTokenDiagnostic, loadTokenSet, type TokenSource } from '@systembook/content/tokens';
import { glob } from 'tinyglobby';
import type { ResolvedConfig } from './config.js';

export interface ProjectTokens {
  /** Só os tokens válidos; `null` sem tokens (sem `tokens` na config, ou nenhum válido). */
  set: TokenSet | null;
  /** Erros (falham o build), já formatados. */
  problems: string[];
  /** Avisos (não falham), já formatados. */
  warnings: string[];
}

/**
 * Lê os arquivos de tokens da config (SYS-128) e passa pelo `loadTokenSet`:
 * os globs de `files` são os arquivos base; os de cada modo, os do modo. Cada
 * padrão precisa casar com algum arquivo dentro do projeto, e um arquivo só
 * pode estar num lugar — base ou um modo.
 */
export async function loadProjectTokens(config: ResolvedConfig): Promise<ProjectTokens> {
  const result: ProjectTokens = { set: null, problems: [], warnings: [] };
  if (!config.tokens) return result;

  const groups: { label: string; mode?: string; patterns: string[] }[] = [
    { label: 'files', patterns: config.tokens.files },
    ...config.tokens.modes.map(([mode, patterns]) => ({ label: `modes.${mode}`, mode, patterns })),
  ];
  /** Onde cada arquivo já apareceu, para recusar o mesmo arquivo em dois lugares. */
  const owners = new Map<string, string>();
  const sources: TokenSource[] = [];

  for (const { label, mode, patterns } of groups) {
    for (const pattern of patterns) {
      const where = `${config.file}: "tokens.${label}"`;
      if (path.isAbsolute(pattern) || pattern.split(/[\\/]/).includes('..')) {
        result.problems.push(`${where}: "${pattern}" precisa ser relativo à raiz e dentro do projeto.`);
        continue;
      }
      // Ordem estável entre sistemas: o glob devolve na ordem do disco.
      const files = (
        await glob(pattern, { cwd: config.root, onlyFiles: true, ignore: ['**/node_modules/**', '**/.git/**'] })
      ).sort();
      if (!files.length) {
        result.problems.push(`${where}: "${pattern}" não casa com nenhum arquivo.`);
        continue;
      }
      for (const file of files) {
        const owner = owners.get(file);
        if (owner === label) continue;
        if (owner) {
          result.problems.push(`${where}: ${file} já está em "tokens.${owner}" — um arquivo é base ou de um modo, não os dois.`);
          continue;
        }
        owners.set(file, label);
        const content = await readFile(path.join(config.root, file), 'utf8');
        sources.push(mode === undefined ? { file, content } : { file, content, mode });
      }
    }
  }
  if (result.problems.length) return result;

  const { set, diagnostics } = loadTokenSet(sources);
  for (const d of diagnostics) (d.severity === 'error' ? result.problems : result.warnings).push(formatTokenDiagnostic(d));
  result.set = set.tokens.length ? set : null;
  return result;
}
