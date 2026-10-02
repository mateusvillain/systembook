import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContentFile } from './types.js';

/** Arquivos que a árvore de conteúdo usa; o resto (imagens etc.) fica no disco. */
const RELEVANT = /\.(md|mdx)$|^_(menu|section)\.yml$/i;

/** Pastas que nunca são percorridas. */
function skipDir(name: string): boolean {
  return name === 'node_modules' || name.startsWith('.');
}

/**
 * Lê do disco os arquivos que `buildContentTree` precisa, com caminhos
 * relativos a `dir` e separador `/` em qualquer sistema. Não entra em
 * `node_modules` nem em pastas ocultas. Extensão em maiúsculas (`.MDX`) é lida
 * para a árvore acusar o erro, em vez de a página sumir.
 */
export async function readContentDir(dir: string): Promise<ContentFile[]> {
  const out: ContentFile[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipDir(entry.name)) await walk(full);
      } else if (entry.isFile() && RELEVANT.test(entry.name)) {
        out.push({ path: path.relative(dir, full).split(path.sep).join('/'), source: await readFile(full, 'utf8') });
      }
    }
  }
  await walk(dir);
  return out;
}
