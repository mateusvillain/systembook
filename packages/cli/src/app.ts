import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { searchForWorkspaceRoot, type InlineConfig, type Plugin } from 'vite';
import { buildEntries, generateEntries, type DiscoveredPreview } from '@systembook/connector';
import type { ResolvedConfig } from './config.js';

/** O app React que vira o site (`app/` do pacote), igual em `src/` e `dist/`. */
export const APP_DIR = fileURLToPath(new URL('../app', import.meta.url));

/** Raiz do pacote `@systembook/docs-site`, onde quer que o gerenciador o ponha. */
function docsSiteDir(): string {
  let dir = path.dirname(createRequire(import.meta.url).resolve('@systembook/docs-site'));
  while (!existsSync(path.join(dir, 'package.json'))) {
    if (path.dirname(dir) === dir) throw new Error('package.json do @systembook/docs-site não encontrado');
    dir = path.dirname(dir);
  }
  return dir;
}

/**
 * O Tailwind do app precisa varrer o `docs-site` (o painel de controles do
 * component-embed usa utilities e tokens do shadcn), e o `@systembook/docs-site`
 * mora num lugar diferente em cada gerenciador de pacotes. O caminho absoluto
 * é resolvido aqui e anexado ao `app/styles.css` antes do Tailwind processá-lo.
 */
function docsSiteSource(dir: string): Plugin {
  const posix = (file: string) => file.split(path.sep).join('/');
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

/**
 * Pastas que o servidor de dev pode servir. O app e as dependências dele
 * moram no pacote instalado — fora da raiz do projeto quando o CLI vem de um
 * cache (`npx`), e fora do pacote do app em qualquer instalação — e o Vite
 * recusa por padrão o que não está na pasta do app.
 */
function servedDirs(config: ResolvedConfig, docsSite: string): string[] {
  // No monorepo do SystemBook, as dependências estão na raiz do workspace.
  const dirs = [config.root, APP_DIR, docsSite, searchForWorkspaceRoot(APP_DIR)];
  for (const dir of [APP_DIR, docsSite]) {
    // A pasta acima do `node_modules` mais externo (o projeto, ou o cache do
    // `npx`) contém todas as dependências instaladas junto do pacote.
    const real = realpathSync(dir).split(path.sep);
    const outer = real.indexOf('node_modules');
    if (outer > 0) dirs.push(real.slice(0, outer).join(path.sep) || path.sep);
  }
  return dirs;
}

/** A parte da config do Vite do app que o `build` e o `dev` compartilham. */
export function appViteConfig(config: ResolvedConfig): InlineConfig {
  const docsSite = docsSiteDir();
  return {
    configFile: false,
    envFile: false,
    root: APP_DIR,
    base: config.base,
    cacheDir: path.join(config.root, 'node_modules/.cache/systembook-vite'),
    plugins: [react(), docsSiteSource(docsSite), tailwindcss()],
    resolve: { dedupe: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] },
    server: { fs: { allow: servedDirs(config, docsSite) } },
  };
}

/**
 * Builda os previews do projeto (o `previews build` do connector) em `outDir`,
 * servidos sob `<base><previewsDir>/`.
 *
 * O Vite só assume produção com o NODE_ENV vazio; com outro valor (o
 * `development` do servidor de dev, o `test` do vitest) o bundle sairia com o
 * React e o JSX de desenvolvimento — e caminhos absolutos da máquina. O Vite e
 * o plugin do React leem o NODE_ENV ao resolver a config, então trocá-lo
 * durante o build não afeta um servidor de dev já criado; mas é estado global
 * do processo: dois builds simultâneos no mesmo processo não são suportados.
 */
export async function withProductionEnv<T>(run: () => Promise<T>): Promise<T> {
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    return await run();
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
  }
}

/** Gera as entradas e builda os previews (com o NODE_ENV de produção). */
export async function buildPreviews(
  config: ResolvedConfig,
  previews: DiscoveredPreview[],
  { outDir, base }: { outDir: string; base: string },
): Promise<void> {
  const entries = await generateEntries(previews, { root: config.root });
  await withProductionEnv(() => buildEntries(entries, { root: config.root, outDir, base }));
}
