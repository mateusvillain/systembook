import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { TokenSet } from '@systembook/schema';
import { formatTokenDiagnostic, loadTokenSet, nonEmptyTokenSet, type TokenSource } from '@systembook/content/tokens';
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

/** Caminho com `/`, relativo à raiz, para os globs e as mensagens. */
const posix = (file: string) => file.split(path.sep).join('/');

/** Caminho relativo que sai da raiz (`..`, `../x`) ou é de outro disco. */
const isOutside = (relative: string) =>
  relative === '..' || relative.startsWith('../') || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);

/**
 * Lê os arquivos de tokens da config (SYS-128) e passa pelo `loadTokenSet`:
 * os globs de `files` são os arquivos base; os de cada modo, os do modo. Cada
 * padrão precisa casar com algum arquivo dentro do projeto, e um arquivo só
 * pode estar num lugar — base ou um modo. Os problemas saem todos de uma vez:
 * um padrão errado não esconde os erros dos arquivos que casaram.
 */
export async function loadProjectTokens(config: ResolvedConfig): Promise<ProjectTokens> {
  const result: ProjectTokens = { set: null, problems: [], warnings: [] };
  if (!config.tokens) return result;

  const root = await realpath(config.root);
  /** Pastas que o próprio Systembook escreve, e a config — nunca são tokens. */
  const ignore = ['**/node_modules/**', '**/.git/**', '.systembook/**', config.file];
  const outDir = posix(path.relative(config.root, config.outDir));
  if (outDir && !isOutside(outDir)) ignore.push(`${outDir}/**`);
  const groups = [
    { label: 'files', mode: undefined, patterns: config.tokens.files },
    ...config.tokens.modes.map(({ name, files }) => ({ label: `modes.${name}`, mode: name, patterns: files })),
  ];
  /** Grupo onde cada arquivo já apareceu, para recusar o mesmo arquivo em dois lugares. */
  const owners = new Map<string, string>();
  const sources: TokenSource[] = [];

  for (const { label, mode, patterns } of groups) {
    if (!patterns.length) continue; // `files` é opcional com modos.
    const where = `${config.file}: "tokens.${label}"`;
    // `\` de quem escreve no Windows; `!padrão` tira arquivos dos outros padrões do grupo.
    const normalized = patterns.map((p) => p.replace(/\\/g, '/'));
    const negated = normalized.filter((p) => p.startsWith('!')).map((p) => p.slice(1));
    const positive = normalized.filter((p) => !p.startsWith('!'));
    if (!positive.length) {
      result.problems.push(`${where}: só há padrões de exclusão ("!…") — informe os arquivos a incluir.`);
      continue;
    }

    for (const pattern of positive) {
      if (path.isAbsolute(pattern) || pattern.split('/').includes('..')) {
        result.problems.push(`${where}: "${pattern}" precisa ser relativo à raiz e dentro do projeto.`);
        continue;
      }
      const files = (
        await glob(pattern, {
          cwd: config.root,
          onlyFiles: true,
          expandDirectories: false,
          ignore: [...ignore, ...negated],
        })
      ).sort(); // Ordem estável entre sistemas: o glob devolve na ordem do disco.
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
        const content = await read(root, file);
        if (typeof content !== 'string') {
          result.problems.push(`${file}  ${content.problem}`);
          continue;
        }
        sources.push(mode === undefined ? { file, content } : { file, content, mode });
      }
    }
  }

  const { set, diagnostics } = loadTokenSet(sources);
  for (const d of diagnostics) (d.severity === 'error' ? result.problems : result.warnings).push(formatTokenDiagnostic(d));
  result.set = nonEmptyTokenSet(set);
  return result;
}

/**
 * Conteúdo do arquivo, sem o BOM que editores do Windows põem (o `JSON.parse`
 * o recusa). Um link simbólico para fora do projeto não é lido.
 */
async function read(root: string, file: string): Promise<string | { problem: string }> {
  try {
    const real = await realpath(path.join(root, file));
    if (isOutside(path.relative(root, real))) {
      return { problem: 'aponta (link simbólico) para fora do projeto — não é lido.' };
    }
    return (await readFile(real, 'utf8')).replace(/^﻿/, '');
  } catch (error) {
    return { problem: `não foi possível ler — ${(error as Error).message}` };
  }
}
