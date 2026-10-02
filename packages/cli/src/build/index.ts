import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build as viteBuild } from 'vite';
import {
  buildContentTree,
  buildSiteData,
  formatDiagnostic,
  siteDataFiles,
  STATIC_DATA_DIR,
  type Diagnostic,
} from '@systembook/content';
import { readContentDir } from '@systembook/content/node';
import type { ResolvedConfig } from '../config.js';
import { META_FILE, renderHtml, routeMetas } from './html.js';

/** O app React que vira o site (`app/` do pacote), igual em `src/` e `dist/`. */
const APP_DIR = fileURLToPath(new URL('../../app', import.meta.url));

/** Onde o Vite põe JS/CSS: sob o `_`, fora do espaço de slugs, como os dados. */
const ASSETS_DIR = '_systembook/assets';

export type BuildResult =
  | { ok: true; outDir: string; routes: number }
  | { ok: false; problems: string[] };

/**
 * `systembook build` (SYS-99): conteúdo → JSONs de dados → bundle Vite da doc
 * pública com a `staticDataSource` → um `index.html` por rota (com `<title>` e
 * meta description) + `404.html`. Tudo sob a `base`, para funcionar servido
 * na raiz ou em subpath, com deep link e refresh, sem regra de rewrite.
 */
export async function buildStaticSite(config: ResolvedConfig): Promise<BuildResult> {
  const unsafe = unsafeOutDir(config);
  if (unsafe) return { ok: false, problems: [unsafe] };

  const tree = buildContentTree(await readContentDir(config.contentDir), {
    statusTags: config.statusTags.map((tag) => tag.titulo),
  });
  const site = buildSiteData(tree, {
    settings: { nomeDesignSystem: config.name, logoUrl: null, logoDarkUrl: null },
    base: config.base,
  });
  const diagnostics = [...tree.diagnostics, ...site.diagnostics];
  if (diagnostics.length) return { ok: false, problems: formatProblems(config, diagnostics) };

  await rm(config.outDir, { recursive: true, force: true });
  await viteBuild({
    configFile: false,
    root: APP_DIR,
    base: config.base,
    logLevel: 'warn',
    cacheDir: path.join(config.root, 'node_modules/.cache/systembook-vite'),
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] },
    // O bundle leva o Tiptap read-only (~300 kB gzip), o que o PRD aceita no MVP.
    build: { outDir: config.outDir, emptyOutDir: false, assetsDir: ASSETS_DIR, chunkSizeWarningLimit: 1500 },
  });

  const write = async (relative: string, content: string) => {
    const file = path.join(config.outDir, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  };

  for (const [file, json] of siteDataFiles(site.data)) await write(path.join(STATIC_DATA_DIR, file), json);

  const template = await readFile(path.join(config.outDir, 'index.html'), 'utf8');
  const routes = routeMetas(site.data, tree.landing?.titulo ?? null);
  for (const route of routes) await write(path.join(route.path, 'index.html'), renderHtml(template, route));
  // O mesmo `<head>` para o app atualizar ao navegar sem recarregar a página.
  await write(path.join(STATIC_DATA_DIR, META_FILE), `${JSON.stringify(routes)}\n`);
  await write(
    '404.html',
    renderHtml(template, { title: `Page not found · ${config.name}`, description: config.name }),
  );
  // O GitHub Pages (Jekyll) ignora pastas com `_` sem isto.
  await write('.nojekyll', '');

  return { ok: true, outDir: config.outDir, routes: routes.length };
}

/** `arquivo:linha:coluna  mensagem`, com o arquivo relativo à raiz do projeto. */
function formatProblems(config: ResolvedConfig, diagnostics: Diagnostic[]): string[] {
  const contentDir = path.relative(config.root, config.contentDir).split(path.sep).join('/');
  return diagnostics.map((d) => formatDiagnostic({ ...d, file: contentDir ? `${contentDir}/${d.file}` : d.file }));
}

/**
 * O `outDir` é apagado a cada build: ele precisa ser uma pasta própria dentro
 * do projeto — nem a raiz, nem fora dela, nem a pasta de conteúdo (ou dentro
 * dela, ou contendo-a), nem `.git`/`node_modules`.
 */
function unsafeOutDir({ root, outDir, contentDir, file }: ResolvedConfig): string | null {
  const inside = (child: string, parent: string) => {
    const rel = path.relative(parent, child);
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
  };
  const [first] = path.relative(root, outDir).split(path.sep);
  const unsafe =
    outDir === root ||
    !inside(outDir, root) ||
    inside(contentDir, outDir) ||
    inside(outDir, contentDir) ||
    first === '.git' ||
    first === 'node_modules';
  if (!unsafe) return null;
  return `${file}: "outDir" (${path.relative(root, outDir) || '.'}) precisa ser uma pasta própria dentro do projeto — não a raiz, nem fora dela, nem a pasta de conteúdo, .git ou node_modules. Ele é apagado a cada build.`;
}
