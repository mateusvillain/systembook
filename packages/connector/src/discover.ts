import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import fg from 'fast-glob';
import { z } from 'zod';
import type { PreviewConfig } from '@systembook/schema';
import { previewConfigSchema } from './preview-config-schema.js';

export interface DiscoveredPreview {
  filePath: string;
  config: PreviewConfig;
}

export interface DiscoveryFailure {
  filePath: string;
  message: string;
}

export interface DiscoveryResult {
  previews: DiscoveredPreview[];
  failures: DiscoveryFailure[];
}

export interface DiscoverOptions {
  /** Raiz da varredura; default `process.cwd()`. */
  root?: string;
}

/**
 * Varre `root` por arquivos `*.preview.tsx` (excluindo node_modules), carrega
 * o default export de cada um e valida contra `PreviewConfig`. Um arquivo
 * inválido vira uma entrada em `failures` sem abortar os demais — o resultado
 * agregado é o insumo da geração de entrypoints (TASK-40).
 */
export async function discoverPreviews(options: DiscoverOptions = {}): Promise<DiscoveryResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const files = await fg('**/*.preview.tsx', {
    cwd: root,
    ignore: ['**/node_modules/**'],
    absolute: true,
  });
  files.sort();

  const previews: DiscoveredPreview[] = [];
  const failures: DiscoveryFailure[] = [];

  for (const filePath of files) {
    try {
      const config = await loadPreviewConfig(filePath);
      previews.push({ filePath, config });
    } catch (error) {
      failures.push({
        filePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { previews, failures };
}

// Carregamento do bundle temporário via require() de CJS, não import()
// dinâmico: bundlers/test runners reescrevem `import()` (o resolver do
// vite-node não enxerga arquivos fora da raiz do projeto) e o truque de
// `new Function('return import(...)')` quebra sob vitest no Node 24 com
// "A dynamic import callback was not specified". O require nativo é opaco a
// esses transforms e se comporta igual sob tsx, vitest e Node puro.
const nodeRequire = createRequire(import.meta.url);

/**
 * Bundla o arquivo com esbuild (JSX/TS não rodam nativos no Node) e carrega o
 * resultado de um arquivo temporário para ler o default export. O módulo do
 * time é executado neste processo — aceitável porque o connector roda no CI
 * do próprio time, sobre o código dele mesmo.
 */
async function loadPreviewConfig(filePath: string): Promise<PreviewConfig> {
  const bundled = await build({
    entryPoints: [filePath],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
  });
  const code = bundled.outputFiles[0]?.text;
  if (!code) throw new Error('esbuild não produziu output para o arquivo');

  const tempDir = await mkdtemp(path.join(tmpdir(), 'systembook-connector-'));
  try {
    const modulePath = path.join(tempDir, 'preview.cjs');
    await writeFile(modulePath, code);
    const mod = nodeRequire(modulePath) as { default?: unknown };

    if (!('default' in mod) || mod.default === undefined) {
      throw new Error('o arquivo não tem default export — esperado um objeto PreviewConfig');
    }
    const parsed = previewConfigSchema.safeParse(mod.default);
    if (!parsed.success) {
      throw new Error(`default export não é um PreviewConfig válido:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
