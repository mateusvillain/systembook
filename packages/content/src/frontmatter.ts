import { parse as parseYaml, YAMLParseError } from 'yaml';
import { z } from 'zod';
import { didYouMean, type DiagnosticBag, type PointLike } from './diagnostics.js';

/**
 * Campos YAML do conteúdo: o frontmatter de cada tipo de arquivo
 * (`docs/static-format.md`, "Frontmatter") e os `_menu.yml`/`_section.yml`.
 * Todos os schemas são estritos: campo desconhecido é erro, com sugestão.
 */

/** Slug de URL — o mesmo padrão do CMS (`slugSchema` do server). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const slug = z.string().regex(SLUG_PATTERN, 'precisa ser um slug: minúsculas, dígitos e hífens simples');
const order = z.number().int('precisa ser um número inteiro');
const title = z.string().trim().min(1, 'não pode ser vazio');

export const pageFrontmatterSchema = z.strictObject({
  title,
  subtitle: z.string().optional(),
  overviewTitle: title.optional(),
  order: order.optional(),
  status: z.string().optional(),
  slug: slug.optional(),
});

export const tabFrontmatterSchema = z.strictObject({
  title,
  order: order.optional(),
  slug: slug.optional(),
});

export const landingFrontmatterSchema = z.strictObject({
  title: title.optional(),
});

/** `_menu.yml` e `_section.yml`. */
export const folderMetaSchema = z.strictObject({
  title: title.optional(),
  order: order.optional(),
  slug: slug.optional(),
});

export type PageFrontmatter = z.infer<typeof pageFrontmatterSchema>;
export type TabFrontmatter = z.infer<typeof tabFrontmatterSchema>;
export type LandingFrontmatter = z.infer<typeof landingFrontmatterSchema>;
export type FolderMeta = z.infer<typeof folderMetaSchema>;

/** Qual frontmatter o arquivo usa, pelo papel dele na árvore. */
export type DocumentKind = 'page' | 'tab' | 'landing';

export type FrontmatterFor<K extends DocumentKind> = K extends 'page'
  ? PageFrontmatter
  : K extends 'tab'
    ? TabFrontmatter
    : LandingFrontmatter;

/** Nome em português do tipo esperado, para as mensagens de erro. */
const EXPECTED: Record<string, string> = { string: 'texto', number: 'um número', object: 'um mapa' };

interface YamlFieldsOptions<S extends z.ZodObject> {
  schema: S;
  /** Linha (1-based) onde o YAML começa no arquivo. */
  firstLine: number;
  /** Onde apontar erros que não são de um campo (ausente, mapa inválido). */
  at: PointLike;
  /** Prefixo das mensagens (`frontmatter: `, ou vazio num `.yml`). */
  prefix: string;
  /** Complemento para campo desconhecido (`" em tab"`…). */
  unknownWhere?: string;
  bag: DiagnosticBag;
}

/**
 * Lê e valida um bloco YAML de campos contra um schema estrito. Erros de campo
 * apontam a linha do campo; mensagens em português. `raw` vazio ou ausente é um
 * mapa vazio. Devolve `null` se houve erro (já registrado).
 */
export function readYamlFields<S extends z.ZodObject>(
  raw: string | undefined,
  options: YamlFieldsOptions<S>,
): z.infer<S> | null {
  const { schema, firstLine, at, prefix, bag } = options;
  let data: unknown = {};
  if (raw !== undefined && raw.trim() !== '') {
    try {
      data = parseYaml(raw);
    } catch (error) {
      const line = error instanceof YAMLParseError ? (error.linePos?.[0]?.line ?? 1) : 1;
      bag.report(
        { line: firstLine + line - 1, column: 1 },
        `${prefix}YAML inválido — ${(error as Error).message.split('\n')[0]!.replace(/\.?$/, '.')}`,
      );
      return null;
    }
    if (data === null) data = {};
    if (typeof data !== 'object' || Array.isArray(data)) {
      bag.report(at, `${prefix}precisa ser um mapa de campos (\`chave: valor\`).`);
      return null;
    }
  }

  const result = schema.safeParse(data);
  if (result.success) return result.data;

  // Linha de cada chave de topo, para apontar o campo com problema.
  const lines = new Map<string, PointLike>();
  (raw ?? '').split('\n').forEach((text, i) => {
    const match = /^([A-Za-z_][\w-]*)\s*:/.exec(text);
    if (match) lines.set(match[1]!, { line: firstLine + i, column: 1 });
  });
  const atKey = (key: PropertyKey | undefined) => lines.get(String(key)) ?? at;

  const known = Object.keys(schema.shape);
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        bag.report(
          atKey(key),
          `${prefix}"${key}" não é um campo aceito${options.unknownWhere ?? ''}${didYouMean(key, known)}.`,
        );
      }
      continue;
    }
    const field = issue.path.join('.');
    const present = (data as Record<string, unknown>)[String(issue.path[0])] !== undefined;
    const message = !present
      ? 'é obrigatório'
      : issue.code === 'invalid_type' && issue.expected in EXPECTED
        ? `precisa ser ${EXPECTED[issue.expected]}`
        : issue.message;
    bag.report(present ? atKey(issue.path[0]) : at, `${prefix}"${field}" ${message}.`);
  }
  return null;
}

const SCHEMAS = {
  page: pageFrontmatterSchema,
  tab: tabFrontmatterSchema,
  landing: landingFrontmatterSchema,
} as const;

const UNKNOWN_WHERE: Record<DocumentKind, string> = {
  page: '',
  tab: ' em tab',
  landing: ' na landing (só `title`)',
};

/**
 * Lê e valida o frontmatter. `raw` é `undefined` quando o arquivo não tem
 * frontmatter; `at` é a posição do `---` de abertura.
 */
export function readFrontmatter<K extends DocumentKind>(
  raw: string | undefined,
  kind: K,
  at: PointLike,
  bag: DiagnosticBag,
): FrontmatterFor<K> | null {
  return readYamlFields(raw, {
    schema: SCHEMAS[kind],
    // O YAML começa na linha seguinte ao `---` de abertura.
    firstLine: at.line + 1,
    at,
    prefix: 'frontmatter: ',
    unknownWhere: UNKNOWN_WHERE[kind],
    bag,
  }) as FrontmatterFor<K> | null;
}
