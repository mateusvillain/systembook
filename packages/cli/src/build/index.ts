import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build as viteBuild } from 'vite';
import { siteDataFiles, STATIC_DATA_DIR } from '@systembook/content';
import { appViteConfig, buildPreviews, withProductionEnv } from '../app.js';
import { unsafeOutDir, type ResolvedConfig } from '../config.js';
import { META_FILE, renderHtml, routeMetas } from './html.js';
import { prepareSite, PREVIEWS_DIR } from './prepare.js';

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
 *
 * Também leva o que o conteúdo referencia (SYS-100): os previews de
 * componente (o `previews build`, em `_systembook/previews/`) e as imagens e
 * logos, copiados com hash no nome. Nada é escrito se houver qualquer problema.
 */
export async function buildStaticSite(config: ResolvedConfig): Promise<BuildResult> {
  const unsafe = unsafeOutDir(config);
  if (unsafe) return { ok: false, problems: [unsafe] };

  const { tree, site, previews, media, problems } = await prepareSite(config);
  if (problems.length) return { ok: false, problems };

  await rm(config.outDir, { recursive: true, force: true });
  if (previews.length) {
    await buildPreviews(config, previews, {
      outDir: path.join(config.outDir, PREVIEWS_DIR),
      base: `${config.base}${PREVIEWS_DIR}/`,
    });
  }
  await withProductionEnv(() =>
    viteBuild({
      ...appViteConfig(config),
      logLevel: 'warn',
      // O bundle leva o Tiptap read-only (~300 kB gzip), o que o PRD aceita no MVP.
      build: { outDir: config.outDir, emptyOutDir: false, assetsDir: ASSETS_DIR, chunkSizeWarningLimit: 1500 },
    }),
  );

  const write = async (relative: string, content: string) => {
    const file = path.join(config.outDir, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  };

  for (const [file, json] of siteDataFiles(site.data)) await write(path.join(STATIC_DATA_DIR, file), json);
  for (const file of media) {
    await mkdir(path.dirname(path.join(config.outDir, file.target)), { recursive: true });
    await copyFile(file.source, path.join(config.outDir, file.target));
  }

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
  if (previews.length) {
    // O iframe do preview é sandboxed (origem opaca), e o browser só carrega
    // os scripts `type=module` dele com CORS liberado — como o server do modo
    // CMS faz. O GitHub Pages já manda o cabeçalho; estes dois arquivos o
    // ligam no Netlify/Cloudflare Pages (`_headers`) e no `npx serve`.
    await write('_headers', `/${PREVIEWS_DIR}/*\n  Access-Control-Allow-Origin: *\n`);
    await write(
      'serve.json',
      `${JSON.stringify({ headers: [{ source: `${PREVIEWS_DIR}/**`, headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] }] }, null, 2)}\n`,
    );
  }

  return { ok: true, outDir: config.outDir, routes: routes.length };
}
