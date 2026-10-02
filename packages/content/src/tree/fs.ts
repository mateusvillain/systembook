import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContentFile } from './types.js';

/** Arquivos que a árvore de conteúdo usa; o resto (imagens etc.) fica no disco. */
const RELEVANT = /\.(md|mdx)$|^_(menu|section)\.yml$/;

/**
 * Lê do disco os arquivos que `buildContentTree` precisa, com caminhos
 * relativos a `dir` e separador `/` em qualquer sistema. Pastas que começam
 * com `.` e `node_modules` não são percorridas.
 */
export async function readContentDir(dir: string): Promise<ContentFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => {
    if (!entry.isFile() || !RELEVANT.test(entry.name)) return false;
    const rel = path.relative(dir, path.join(entry.parentPath, entry.name));
    return !rel.split(path.sep).some((s) => s === 'node_modules' || (s.startsWith('.') && s !== '.'));
  });
  return Promise.all(
    files.map(async (entry) => {
      const full = path.join(entry.parentPath, entry.name);
      return {
        path: path.relative(dir, full).split(path.sep).join('/'),
        source: await readFile(full, 'utf8'),
      };
    }),
  );
}
