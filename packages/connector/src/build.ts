import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { build as viteBuild } from 'vite';
import type { GeneratedEntry } from './generate.js';

// As entradas sintéticas importam '@systembook/preview-kit', mas vivem em
// `.systembook/entries` do repo alvo — com pnpm estrito (ou entries em temp),
// a resolução node a partir dali não encontra a dependência transitiva do
// connector. O alias resolve o pacote a partir do próprio connector.
const require = createRequire(import.meta.url);

// react/react-dom precisam de alias explícito por dois motivos: (1) o
// plugin-react injeta resolve.dedupe ['react','react-dom'], que re-resolve
// esses imports a partir do root do Vite (o diretório de entries), onde a
// cadeia node_modules não alcança; (2) semanticamente o preview DEVE usar o
// React do repo alvo — duas cópias de React quebrariam hooks. Resolvemos os
// pacotes a partir do root do repo e apontamos o alias para o diretório.
function resolveReactDirsFromRepo(root: string): { react: string; reactDom: string } {
  const repoRequire = createRequire(path.join(root, '__systembook__.js'));
  try {
    return {
      react: path.dirname(repoRequire.resolve('react/package.json')),
      reactDom: path.dirname(repoRequire.resolve('react-dom/package.json')),
    };
  } catch (error) {
    throw new Error(
      `react/react-dom não resolvem a partir de ${root} — instale-os no repo alvo (componentes de preview precisam deles)`,
      { cause: error },
    );
  }
}

export interface BuildOptions {
  /** Raiz do repo alvo; default `process.cwd()`. */
  root?: string;
  /** Destino do artefato estático; default `<root>/.systembook/dist`. */
  outDir?: string;
}

export interface BuildResult {
  outDir: string;
}

/**
 * Linha do `manifest.json` escrito na raiz do artefato: mapeia cada
 * diretório de variante (slug) de volta ao par canônico (component,
 * variantId) do `*.preview.tsx`. O step de upload do CI (docs/ci-example.md)
 * itera este manifest para enviar cada variante ao /api/previews com os
 * valores originais — o nome do diretório é slug e não serve para isso.
 */
export interface ManifestEntry {
  component: string;
  variantId: string;
  entryDir: string;
}

/**
 * Builda todas as entradas geradas (TASK-40) num único build Vite multi-entry,
 * produzindo o artefato estático pronto para upload (TASK-43).
 *
 * - `base: './'` — os HTMLs referenciam assets por caminho relativo, porque o
 *   artefato será re-hospedado num path aninhado da instância (TASK-46);
 *   base absoluta quebraria lá.
 * - `configFile: false` — o build roda no CI do time consumidor e não pode
 *   herdar o vite.config do repo alvo (plugins/aliases deles não se aplicam
 *   às entradas sintéticas).
 * - Qualquer erro de compilação rejeita a promise inteira — sem artefato
 *   parcial; o CLI converte isso em exit code != 0.
 */
export async function buildEntries(
  entries: GeneratedEntry[],
  options: BuildOptions = {},
): Promise<BuildResult> {
  if (entries.length === 0) {
    throw new Error(
      'nenhuma entrada para buildar — verifique se o repo tem arquivos *.preview.tsx válidos',
    );
  }

  const root = path.resolve(options.root ?? process.cwd());
  const outDir = path.resolve(options.outDir ?? path.join(root, '.systembook', 'dist'));
  const entriesDir = path.dirname(entries[0]!.entryDir);
  const reactDirs = resolveReactDirsFromRepo(root);

  const input: Record<string, string> = {};
  for (const entry of entries) {
    input[path.basename(entry.entryDir)] = path.join(entry.entryDir, 'index.html');
  }

  try {
    await viteBuild({
      configFile: false,
      envFile: false,
      // fixo em production: sob test runners (NODE_ENV=test) o plugin-react
      // emitiria jsx-dev-runtime no bundle
      mode: 'production',
      root: entriesDir,
      base: './',
      logLevel: 'warn',
      plugins: [react()],
      resolve: {
        // ordem importa só para leitura — 'react' não engole 'react-dom'
        // (o prefixo de alias precisa terminar em '/')
        alias: {
          '@systembook/preview-kit': require.resolve('@systembook/preview-kit'),
          'react-dom': reactDirs.reactDom,
          react: reactDirs.react,
        },
      },
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: { input },
      },
    });
  } catch (error) {
    throw new Error(
      `build Vite falhou — nenhum artefato foi produzido: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const manifest: ManifestEntry[] = entries.map((entry) => ({
    component: entry.componentName,
    variantId: entry.variantId,
    entryDir: path.basename(entry.entryDir),
  }));
  await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // preview-config.json por variante (TASK-49): fica DENTRO do entryDir para
  // viajar no mesmo tar da variante (docs/ci-example.md tara `<entryDir> assets`)
  // e ser extraído ao lado do index.html na instância. O Vite não copia
  // arquivos arbitrários do root para o dist, então gravamos após o build.
  for (const entry of entries) {
    const dir = path.join(outDir, path.basename(entry.entryDir));
    await writeFile(
      path.join(dir, 'preview-config.json'),
      `${JSON.stringify(entry.config, null, 2)}\n`,
    );
  }

  return { outDir };
}
