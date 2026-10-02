import { parse as parseYaml, YAMLParseError } from 'yaml';
import { z } from 'zod';
import { didYouMean, type DiagnosticBag, type PointLike } from './diagnostics.js';

/**
 * Frontmatter de cada tipo de arquivo (`docs/static-format.md`,
 * "Frontmatter"). Todos são estritos: campo desconhecido é erro, com sugestão.
 */

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'precisa ser um slug: minúsculas, dígitos e hífens simples');
const order = z.number().int('precisa ser um número inteiro');
const title = z.string().trim().min(1, 'não pode ser vazio');

export const pageFrontmatterSchema = z.strictObject({
  title,
  subtitle: z.string().optional(),
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

export type PageFrontmatter = z.infer<typeof pageFrontmatterSchema>;
export type TabFrontmatter = z.infer<typeof tabFrontmatterSchema>;
export type LandingFrontmatter = z.infer<typeof landingFrontmatterSchema>;

/** Qual frontmatter o arquivo usa, pelo papel dele na árvore. */
export type DocumentKind = 'page' | 'tab' | 'landing';

export type FrontmatterFor<K extends DocumentKind> = K extends 'page'
  ? PageFrontmatter
  : K extends 'tab'
    ? TabFrontmatter
    : LandingFrontmatter;

/** Nome em português do tipo esperado, para as mensagens de erro. */
const EXPECTED: Record<string, string> = { string: 'texto', number: 'um número', object: 'um mapa' };

const SCHEMAS = {
  page: pageFrontmatterSchema,
  tab: tabFrontmatterSchema,
  landing: landingFrontmatterSchema,
} as const;

/**
 * Lê e valida o YAML do frontmatter. `raw` é `undefined` quando o arquivo não
 * tem frontmatter. Devolve `null` se houve erro (já registrado em `bag`).
 */
export function readFrontmatter<K extends DocumentKind>(
  raw: string | undefined,
  kind: K,
  at: PointLike,
  bag: DiagnosticBag,
): FrontmatterFor<K> | null {
  let data: unknown = {};
  if (raw !== undefined && raw.trim() !== '') {
    try {
      data = parseYaml(raw);
    } catch (error) {
      const line = error instanceof YAMLParseError ? (error.linePos?.[0]?.line ?? 0) : 0;
      // +1: o YAML começa na linha seguinte ao `---` de abertura.
      bag.report({ line: at.line + line, column: 1 }, `frontmatter: YAML inválido — ${(error as Error).message.split('\n')[0]}`);
      return null;
    }
    if (data === null) data = {};
    if (typeof data !== 'object' || Array.isArray(data)) {
      bag.report(at, 'frontmatter: precisa ser um mapa de campos (`chave: valor`).');
      return null;
    }
  }

  const schema = SCHEMAS[kind];
  const result = schema.safeParse(data);
  if (result.success) return result.data as FrontmatterFor<K>;

  const known = Object.keys(schema.shape);
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        const where = kind === 'landing' ? ' na landing (só `title`)' : kind === 'tab' ? ' em tab' : '';
        bag.report(at, `frontmatter: "${key}" não é um campo aceito${where}${didYouMean(key, known)}.`);
      }
    } else {
      const field = issue.path.join('.');
      const present = (data as Record<string, unknown>)[String(issue.path[0])] !== undefined;
      const message = !present
        ? 'é obrigatório'
        : issue.code === 'invalid_type' && issue.expected in EXPECTED
          ? `precisa ser ${EXPECTED[issue.expected]}`
          : issue.message;
      bag.report(at, `frontmatter: "${field}" ${message}.`);
    }
  }
  return null;
}
