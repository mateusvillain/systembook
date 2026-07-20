import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PreviewConfig } from '@systembook/schema';
import type { DiscoveredPreview } from './discover.js';

export interface GeneratedEntry {
  componentName: string;
  variantId: string;
  /** Diretório da entrada, contendo `index.tsx` e `index.html`. */
  entryDir: string;
  /**
   * PreviewConfig completo do componente — o build (TASK-49) o grava como
   * `preview-config.json` ao lado do artefato para o painel de controles do
   * admin ler os `controls` sem um segundo round-trip ao arquivo estático.
   */
  config: PreviewConfig;
}

export interface GenerateOptions {
  /** Raiz do repo alvo; default `process.cwd()`. */
  root?: string;
  /** Destino das entradas; default `<root>/.systembook/entries` (git-ignorável, nunca commitado). */
  outDir?: string;
}

/**
 * Gera um entrypoint Vite por variante de cada preview descoberto:
 * `{outDir}/{component}--{variantId}/index.tsx` + `index.html`.
 *
 * Convenção (contrato documentado em `PreviewConfig`, @systembook/schema): o
 * próprio `*.preview.tsx` exporta o componente a renderizar como export
 * nomeado `Preview`, além do `PreviewConfig` como default — a entrada importa
 * os dois do arquivo original e chama `mount()` com a variante fixada.
 *
 * O diretório de saída é limpo por completo antes de regenerar, então
 * variantes/componentes removidos do fonte não deixam entradas órfãs e duas
 * execuções seguidas produzem o mesmo resultado.
 */
export async function generateEntries(
  previews: DiscoveredPreview[],
  options: GenerateOptions = {},
): Promise<GeneratedEntry[]> {
  const root = path.resolve(options.root ?? process.cwd());
  const outDir = path.resolve(options.outDir ?? path.join(root, '.systembook', 'entries'));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const entries: GeneratedEntry[] = [];
  const dirNameOwners = new Map<string, string>();

  for (const preview of previews) {
    const componentSlug = slugify(preview.config.component);
    for (const variant of preview.config.variants) {
      const dirName = `${componentSlug}--${slugify(variant.id)}`;
      const owner = dirNameOwners.get(dirName);
      if (owner !== undefined) {
        throw new Error(
          `entrada duplicada "${dirName}": ${owner} e ${preview.filePath} geram o mesmo nome de diretório — renomeie o component ou o id da variante`,
        );
      }
      dirNameOwners.set(dirName, preview.filePath);

      const entryDir = path.join(outDir, dirName);
      await mkdir(entryDir, { recursive: true });
      const importPath = toPosixRelative(entryDir, preview.filePath);
      await writeFile(path.join(entryDir, 'index.tsx'), entryTsx(importPath, variant.id));
      await writeFile(
        path.join(entryDir, 'index.html'),
        entryHtml(preview.config.component, variant.label),
      );
      entries.push({
        componentName: preview.config.component,
        variantId: variant.id,
        entryDir,
        config: preview.config,
      });
    }
  }

  return entries;
}

/** Nome seguro para diretório: minúsculas, [a-z0-9-], sem dashes duplicados. */
function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error(`não foi possível derivar um nome de diretório de "${value}"`);
  return slug;
}

/** Caminho relativo com separador POSIX (imports em código gerado). */
function toPosixRelative(fromDir: string, toFile: string): string {
  const rel = path.relative(fromDir, toFile).split(path.sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function entryTsx(previewImportPath: string, variantId: string): string {
  return `// Gerado por @systembook/connector — não editar nem commitar.
import config, { Preview } from '${previewImportPath}';
import { mount } from '@systembook/preview-kit';

const root = document.getElementById('root');
if (!root) throw new Error('elemento #root não encontrado no HTML do preview');

mount(root, config, Preview, { variantId: ${JSON.stringify(variantId)} });
`;
}

function entryHtml(componentName: string, variantLabel: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(componentName)} — ${escapeHtml(variantLabel)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
