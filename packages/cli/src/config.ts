import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { z } from 'zod';

/**
 * `systembook.config.{ts,js,mjs,json}` (SYS-99), o formato de
 * `docs/static-format.md`. Campo desconhecido é erro.
 */
const configSchema = z.strictObject({
  name: z.string().trim().min(1, 'é obrigatório'),
  logo: z.string().min(1).optional(),
  logoDark: z.string().min(1).optional(),
  contentDir: z.string().min(1).default('docs'),
  outDir: z.string().min(1).default('systembook-dist'),
  base: z
    .string()
    .regex(/^\//, 'precisa começar com "/" (ex.: "/meu-repo/")')
    .default('/')
    .transform((base) => (base.endsWith('/') ? base : `${base}/`)),
  statusTags: z
    .array(z.strictObject({ titulo: z.string().trim().min(1), cor: z.string().min(1) }))
    .default([]),
  previews: z.boolean().optional(),
});

/** O que o usuário escreve na config (`satisfies SystemBookConfig`). */
export type SystemBookConfig = z.input<typeof configSchema>;

/** Config validada, com os padrões aplicados e os caminhos absolutos. */
export interface ResolvedConfig extends Omit<z.output<typeof configSchema>, 'contentDir' | 'outDir'> {
  /** Raiz do projeto (onde a config está). */
  root: string;
  /** Arquivo da config, relativo à raiz. */
  file: string;
  contentDir: string;
  outDir: string;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ConfigError';
  }
}

const CONFIG_FILES = ['systembook.config.ts', 'systembook.config.js', 'systembook.config.mjs', 'systembook.config.json'];

/** Acha, carrega e valida a config na raiz do projeto. */
export async function loadConfig(root: string): Promise<ResolvedConfig> {
  const found = CONFIG_FILES.filter((name) => existsSync(path.join(root, name)));
  if (!found.length) {
    throw new ConfigError([`nenhum ${CONFIG_FILES.join(', ')} em ${root}.`]);
  }
  if (found.length > 1) {
    throw new ConfigError([`mais de uma config em ${root} (${found.join(', ')}) — mantenha só uma.`]);
  }
  const file = found[0]!;
  const raw = await readRaw(path.join(root, file));

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => {
        const field = issue.path.length ? `"${issue.path.join('.')}"` : null;
        return `${file}: ${field ? `${field}: ` : ''}${issue.message}`;
      }),
    );
  }
  const { contentDir, outDir, ...config } = parsed.data;
  return {
    ...config,
    root,
    file,
    contentDir: path.resolve(root, contentDir),
    outDir: path.resolve(root, outDir),
  };
}

async function readRaw(file: string): Promise<unknown> {
  if (file.endsWith('.json')) {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      throw new ConfigError([`${path.basename(file)}: JSON inválido — ${(error as Error).message}`]);
    }
  }
  // TS e JS passam pelo esbuild para um .mjs temporário ao lado da config: tira
  // os tipos, aceita ESM e CJS, e os imports de pacotes resolvem do projeto.
  const temp = path.join(path.dirname(file), `.systembook-config-${process.pid}-${Date.now()}.mjs`);
  try {
    await build({
      entryPoints: [file],
      outfile: temp,
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
    });
    const mod = (await import(pathToFileURL(temp).href)) as { default?: unknown };
    if (mod.default === undefined) {
      throw new ConfigError([`${path.basename(file)}: a config precisa de um \`export default\`.`]);
    }
    return mod.default;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError([`${path.basename(file)}: não foi possível carregar — ${(error as Error).message}`]);
  } finally {
    await rm(temp, { force: true });
  }
}
