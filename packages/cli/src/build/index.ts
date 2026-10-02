import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build as viteBuild, type Plugin } from 'vite';
import { buildEntries, generateEntries } from '@systembook/connector';
import { siteDataFiles, STATIC_DATA_DIR } from '@systembook/content';
import type { ResolvedConfig } from '../config.js';
import { META_FILE, renderHtml, routeMetas } from './html.js';
import { prepareSite, PREVIEWS_DIR } from './prepare.js';

/** O app React que vira o site (`app/` do pacote), igual em `src/` e `dist/`. */
const APP_DIR = fileURLToPath(new URL('../../app', import.meta.url));

/**
 * O Tailwind do app precisa varrer o `docs-site` (o painel de controles do
 * component-embed usa utilities e tokens do shadcn), e o `@systembook/docs-site`
 * mora num lugar diferente em cada gerenciador de pacotes. O caminho absoluto
 * é resolvido aqui e anexado ao `app/styles.css` antes do Tailwind processá-lo.
 */
function docsSiteSource(): Plugin {
  const posix = (file: string) => file.split(path.sep).join('/');
  let dir = path.dirname(createRequire(import.meta.url).resolve('@systembook/docs-site'));
  while (!existsSync(path.join(dir, 'package.json'))) {
    if (path.dirname(dir) === dir) throw new Error('package.json do @systembook/docs-site não encontrado');
    dir = path.dirname(dir);
  }
  const source = posix(path.join(dir, 'src'));
  // Os ids do Vite usam `/` em qualquer sistema (e podem trazer `?query`).
  const stylesId = posix(path.join(APP_DIR, 'styles.css'));
  return {
    name: 'systembook:docs-site-source',
    enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith(stylesId)) return null;
      return `${code}\n@source ${JSON.stringify(source)};\n`;
    },
  };
}

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
  // O Vite só assume produção com o NODE_ENV vazio; com outro valor (um
  // `development` herdado do shell, o `test` do vitest) o bundle sairia com o
  // React e o JSX de desenvolvimento — e caminhos absolutos da máquina. É
  // estado global do processo: dois builds simultâneos no mesmo processo não
  // são suportados.
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    if (previews.length) {
      const entries = await generateEntries(previews, { root: config.root });
      await buildEntries(entries, {
        root: config.root,
        outDir: path.join(config.outDir, PREVIEWS_DIR),
        base: `${config.base}${PREVIEWS_DIR}/`,
      });
    }
    await viteBuild({
      configFile: false,
      root: APP_DIR,
      base: config.base,
      logLevel: 'warn',
      cacheDir: path.join(config.root, 'node_modules/.cache/systembook-vite'),
      plugins: [react(), docsSiteSource(), tailwindcss()],
      resolve: { dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] },
      // O bundle leva o Tiptap read-only (~300 kB gzip), o que o PRD aceita no MVP.
      build: { outDir: config.outDir, emptyOutDir: false, assetsDir: ASSETS_DIR, chunkSizeWarningLimit: 1500 },
    });
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
  }

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
