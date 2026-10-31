import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import type { LocaleInfo } from '@systembook/schema';
import { isLocaleCode, localeSegment } from '@systembook/content/site';
import { z } from 'zod';

/**
 * `systembook.config.{ts,js,mjs,json}` (SYS-99), o formato de
 * `docs/static-format.md`. Campo desconhecido é erro.
 */
const baseSchema = z
  .string()
  .regex(/^\//, 'precisa começar com "/" (ex.: "/meu-repo/")')
  .transform((base) => (base.endsWith('/') ? base : `${base}/`));

/** Arquivos de tokens já normalizados: os base e os de cada modo, na ordem da config. */
export interface TokenFiles {
  files: string[];
  modes: { name: string; files: string[] }[];
}

/** Um arquivo, um glob ou uma lista deles — relativos à raiz do projeto. */
const tokenFilesSchema = z
  .union([z.string().min(1), z.array(z.string().min(1))])
  .transform((files) => (typeof files === 'string' ? [files] : files));

/**
 * Arquivos DTCG de design tokens (`docs/tokens.md`): só os base
 * (`"tokens/*.json"`), ou `{ files, modes }` com os arquivos de cada modo.
 */
const tokensSchema = z
  .union(
    [
      tokenFilesSchema,
      z.strictObject({
        files: tokenFilesSchema.optional(),
        modes: z.record(z.string(), tokenFilesSchema).optional(),
      }),
    ],
    { error: 'use um arquivo ou glob, uma lista deles, ou { files, modes }' },
  )
  .transform((tokens): TokenFiles =>
    Array.isArray(tokens)
      ? { files: tokens, modes: [] }
      : {
          files: tokens.files ?? [],
          modes: Object.entries(tokens.modes ?? {}).map(([name, files]) => ({ name, files })),
        },
  )
  .superRefine((tokens, ctx) => {
    if (!tokens.files.length && !tokens.modes.length) {
      ctx.addIssue({ code: 'custom', message: 'informe ao menos um arquivo, em "files" ou em "modes"' });
    }
    for (const { name, files } of tokens.modes) {
      if (!name.trim()) ctx.addIssue({ code: 'custom', path: ['modes'], message: `nome de modo vazio ("${name}")` });
      else if (!files.length) ctx.addIssue({ code: 'custom', path: ['modes', name], message: 'a lista não pode ser vazia' });
    }
  });

const localeSchema = z.strictObject({
  code: z.string().refine(isLocaleCode, 'código de idioma inválido — use uma tag BCP 47 (ex.: "en", "pt-BR")'),
  label: z.string().trim().min(1, 'é obrigatório'),
});

/**
 * Idiomas do site (SYS-163): o padrão — servido sem prefixo, com o conteúdo
 * de `contentDir` — e os de tradução, cada um com a pasta que espelha o
 * conteúdo. Os códigos (e os segmentos de URL, o código em minúsculas) não se
 * repetem.
 */
const localesSchema = z
  .strictObject({
    default: localeSchema,
    translations: z.array(localeSchema.extend({ dir: z.string().min(1).optional() })).default([]),
  })
  .superRefine((locales, ctx) => {
    const all = [locales.default, ...locales.translations];
    all.forEach(({ code }, i) => {
      const first = all.findIndex((other) => localeSegment(other.code) === localeSegment(code));
      if (first === i) return;
      const other = all[first]!.code;
      ctx.addIssue({
        code: 'custom',
        path: i === 0 ? ['default', 'code'] : ['translations', i - 1, 'code'],
        message:
          other === code
            ? `código "${code}" repetido`
            : `"${code}" e "${other}" dão o mesmo segmento de URL ("${localeSegment(code)}") — use um só`,
      });
    });
  });

const configSchema = z.strictObject({
  name: z.string().trim().min(1, 'é obrigatório'),
  logo: z.string().min(1).optional(),
  logoDark: z.string().min(1).optional(),
  contentDir: z.string().min(1).default('docs'),
  outDir: z.string().min(1).default('systembook-dist'),
  base: baseSchema.default('/'),
  statusTags: z
    .array(z.strictObject({ titulo: z.string().trim().min(1), cor: z.string().min(1) }))
    .default([]),
  previews: z.boolean().optional(),
  tokens: tokensSchema.optional(),
  locales: localesSchema.optional(),
});

/** O que o usuário escreve na config (`satisfies SystemBookConfig`). */
export type SystemBookConfig = z.input<typeof configSchema>;

/** Idioma de tradução, com a pasta do conteúdo traduzido. */
export interface TranslationLocale extends LocaleInfo {
  /** Caminho absoluto da pasta que espelha o `contentDir`. */
  dir: string;
}

/** Idiomas resolvidos; sem `locales` na config, só o padrão `en`. */
export interface ResolvedLocales {
  default: LocaleInfo;
  translations: TranslationLocale[];
}

/** Idioma único de quem não configura `locales`. */
const DEFAULT_LOCALE: LocaleInfo = { code: 'en', label: 'English' };

/** Config validada, com os padrões aplicados e os caminhos absolutos. */
export interface ResolvedConfig extends Omit<z.output<typeof configSchema>, 'contentDir' | 'outDir' | 'locales'> {
  /** Raiz do projeto (onde a config está). */
  root: string;
  /** Arquivo da config, relativo à raiz. */
  file: string;
  contentDir: string;
  outDir: string;
  locales: ResolvedLocales;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ConfigError';
  }
}

/** Nomes aceitos para a config, na raiz do projeto. */
export const CONFIG_FILES = ['systembook.config.ts', 'systembook.config.js', 'systembook.config.mjs', 'systembook.config.json'];

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
  const { contentDir, outDir, locales, ...config } = parsed.data;
  const resolved = {
    ...config,
    root,
    file,
    contentDir: path.resolve(root, contentDir),
    outDir: path.resolve(root, outDir),
  };
  const translations = (locales?.translations ?? []).map(({ code, label, dir }) => ({
    code,
    label,
    // Padrão: irmã do conteúdo, com o segmento do idioma (`docs` → `docs-pt-br`).
    dir: dir ? path.resolve(root, dir) : `${resolved.contentDir}-${localeSegment(code)}`,
  }));
  const problems = translationDirProblems(resolved, translations);
  if (problems.length) throw new ConfigError(problems);
  return { ...resolved, locales: { default: locales?.default ?? DEFAULT_LOCALE, translations } };
}

/** `child` é `parent` ou fica dentro dele. */
function inside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * A pasta de cada idioma é só dele, dentro do projeto: não se sobrepõe ao
 * conteúdo (o idioma padrão leria a tradução como menu, e vice-versa), ao
 * `outDir` (apagado a cada build) nem à pasta de outro idioma.
 */
function translationDirProblems(
  { root, file, contentDir, outDir }: Pick<ResolvedConfig, 'root' | 'file' | 'contentDir' | 'outDir'>,
  translations: TranslationLocale[],
): string[] {
  const shown = (dir: string) => path.relative(root, dir).split(path.sep).join('/') || '.';
  const overlap = (a: string, b: string) => inside(a, b) || inside(b, a);
  const problems: string[] = [];
  translations.forEach(({ code, dir }, i) => {
    const field = `${file}: "locales.translations.${i}.dir"`;
    // `inside(root, dir)`: a raiz contém o conteúdo, então cai na sobreposição abaixo.
    if (!inside(dir, root)) problems.push(`${field}: a pasta de "${code}" (${shown(dir)}) fica fora do projeto — informe uma pasta dentro dele em "dir".`);
    else if (overlap(dir, contentDir)) problems.push(`${field}: a pasta de "${code}" (${shown(dir)}) se sobrepõe ao "contentDir" (${shown(contentDir)}) — use uma pasta própria.`);
    else if (overlap(dir, outDir)) problems.push(`${field}: a pasta de "${code}" (${shown(dir)}) se sobrepõe ao "outDir" (${shown(outDir)}), que é apagado a cada build.`);
    const other = translations.slice(0, i).find((t) => overlap(t.dir, dir));
    if (other) problems.push(`${field}: a pasta de "${code}" (${shown(dir)}) se sobrepõe à de "${other.code}" (${shown(other.dir)}) — cada idioma tem a sua.`);
  });
  return problems;
}

/**
 * A config com outra `base` — o `--base` do `build`, para o CI publicar num
 * subpath que só ele conhece (o `base_path` do GitHub Pages).
 */
export function withBase(config: ResolvedConfig, base: string): ResolvedConfig {
  const parsed = baseSchema.safeParse(base);
  if (!parsed.success) throw new ConfigError([`--base: ${parsed.error.issues[0]!.message}`]);
  // Barras repetidas (`/repo//`, de uma concatenação no workflow) viram uma.
  return { ...config, base: parsed.data.replace(/\/{2,}/g, '/') };
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

/**
 * O `outDir` é apagado a cada build: ele precisa ser uma pasta própria dentro
 * do projeto — nem a raiz, nem fora dela, nem a pasta de conteúdo (ou dentro
 * dela, ou contendo-a), nem `.git`/`node_modules`.
 */
export function unsafeOutDir({ root, outDir, contentDir, file }: ResolvedConfig): string | null {
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
