import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { didYouMean } from '../diagnostics.js';
import { TokenDiagnosticBag, type TokenDiagnostic } from './diagnostics.js';
import { aliasesIn, aliasTarget } from './resolve.js';
import type { ResolvedToken } from './types.js';

/**
 * Validação de tokens (SYS-126): `$type` conhecido e valor no formato do tipo,
 * em cada modo, sobre o valor já resolvido. Aceita as duas formas que
 * circulam — texto (`"#0a84ff"`, `"16px"`) e a de objeto da spec 2025.10.
 *
 * Nos tipos compostos, campo com valor errado é erro; campo faltando ou
 * desconhecido é aviso, porque a doc ainda consegue mostrar o resto.
 */

/**
 * Os tipos de `TokenType` em runtime — `@systembook/schema` é types-only. A
 * asserção abaixo quebra o typecheck se as duas listas divergirem.
 */
export const TOKEN_TYPES = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'cubicBezier',
  'number',
  'strokeStyle',
  'border',
  'transition',
  'shadow',
  'gradient',
  'typography',
] as const satisfies readonly TokenType[];

const _assertAllTokenTypes: [Exclude<TokenType, (typeof TOKEN_TYPES)[number]>] extends [never] ? true : never = true;

export function isTokenType(value: string): value is TokenType {
  return (TOKEN_TYPES as readonly string[]).includes(value);
}

type JsonObject = { [key: string]: TokenValue };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** O que cabe num campo: um tipo de token ou um booleano (`shadow.inset`). */
type FieldKind = TokenType | 'boolean';

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** Funções CSS (`rgb(…)`, `oklch(…)`) e nomes (`transparent`, `rebeccapurple`). */
const CSS_COLOR = /^(?:[a-z-]+\(.+\)|[a-z]+)$/i;
const DIMENSION = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[a-z]+|%)?$/i;
const DURATION = /^(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)$/;
const FONT_WEIGHTS = new Set([
  'thin', 'hairline', 'extra-light', 'ultra-light', 'light', 'normal', 'regular', 'book', 'medium',
  'semi-bold', 'demi-bold', 'bold', 'extra-bold', 'ultra-bold', 'black', 'heavy', 'extra-black', 'ultra-black',
]);
const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset']);
const LINE_CAPS = new Set(['round', 'butt', 'square']);

type CompositeType = 'border' | 'transition' | 'shadow' | 'gradient' | 'typography';
/** O que tem validador próprio: tipos sem campos, e o booleano. */
type PrimitiveKind = Exclude<FieldKind, CompositeType>;

/** Validadores dos tipos que não têm campos. */
const PRIMITIVE: Record<PrimitiveKind, (v: TokenValue) => boolean> = {
  color: (v) =>
    typeof v === 'string'
      ? v.startsWith('#') ? HEX.test(v) : CSS_COLOR.test(v)
      : isObject(v) &&
        typeof v.colorSpace === 'string' &&
        Array.isArray(v.components) &&
        v.components.length === 3 &&
        v.components.every((c) => isNumber(c) || c === 'none') &&
        (v.alpha === undefined || (isNumber(v.alpha) && v.alpha >= 0 && v.alpha <= 1)) &&
        (v.hex === undefined || (typeof v.hex === 'string' && HEX.test(v.hex))),
  dimension: (v) =>
    typeof v === 'string' ? DIMENSION.test(v) : isObject(v) && isNumber(v.value) && typeof v.unit === 'string' && v.unit !== '',
  fontFamily: (v) =>
    typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) && v.length > 0 && v.every((f) => typeof f === 'string' && f.trim() !== ''),
  fontWeight: (v) => (isNumber(v) ? v >= 1 && v <= 1000 : typeof v === 'string' && FONT_WEIGHTS.has(v.toLowerCase())),
  duration: (v) =>
    typeof v === 'string' ? DURATION.test(v) : isObject(v) && isNumber(v.value) && v.value >= 0 && (v.unit === 'ms' || v.unit === 's'),
  cubicBezier: (v) =>
    Array.isArray(v) && v.length === 4 && v.every(isNumber) && [v[0], v[2]].every((x) => (x as number) >= 0 && (x as number) <= 1),
  number: isNumber,
  strokeStyle: (v) =>
    typeof v === 'string'
      ? STROKE_STYLES.has(v)
      : isObject(v) &&
        Array.isArray(v.dashArray) &&
        v.dashArray.length > 0 &&
        v.dashArray.every((d) => PRIMITIVE.dimension(d)) &&
        typeof v.lineCap === 'string' &&
        LINE_CAPS.has(v.lineCap),
  boolean: (v) => typeof v === 'boolean',
};

const DESCRIBE: Record<FieldKind, string> = {
  color: 'uma cor ("#0a84ff", "rgb(…)" ou { colorSpace, components })',
  dimension: 'uma dimensão ("16px" ou { value, unit })',
  fontFamily: 'uma família de fonte (texto ou lista de textos)',
  fontWeight: 'um peso de fonte (1 a 1000 ou um nome como "bold")',
  duration: 'uma duração ("200ms" ou { value, unit })',
  cubicBezier: 'uma curva [x1, y1, x2, y2], com x1 e x2 entre 0 e 1',
  number: 'um número',
  strokeStyle: 'um estilo de traço ("solid", "dashed"… ou { dashArray, lineCap })',
  border: 'uma borda',
  transition: 'uma transição',
  shadow: 'uma sombra',
  gradient: 'um gradiente',
  typography: 'uma tipografia',
  boolean: 'true ou false',
};

interface FieldSpec {
  kinds: PrimitiveKind[];
  optional?: boolean;
}

/** Campos de cada objeto composto (no `shadow` e no `gradient`, de cada item). */
const FIELDS: Record<CompositeType, Record<string, FieldSpec>> = {
  border: { color: { kinds: ['color'] }, width: { kinds: ['dimension'] }, style: { kinds: ['strokeStyle'] } },
  transition: {
    duration: { kinds: ['duration'] },
    delay: { kinds: ['duration'] },
    timingFunction: { kinds: ['cubicBezier'] },
  },
  shadow: {
    color: { kinds: ['color'] },
    offsetX: { kinds: ['dimension'] },
    offsetY: { kinds: ['dimension'] },
    blur: { kinds: ['dimension'] },
    spread: { kinds: ['dimension'] },
    inset: { kinds: ['boolean'], optional: true },
  },
  gradient: { color: { kinds: ['color'] }, position: { kinds: ['number'] } },
  typography: {
    fontFamily: { kinds: ['fontFamily'] },
    fontSize: { kinds: ['dimension'] },
    fontWeight: { kinds: ['fontWeight'] },
    letterSpacing: { kinds: ['dimension'] },
    // A spec pede número; altura de linha em dimensão ("24px") é comum demais para recusar.
    lineHeight: { kinds: ['number', 'dimension'] },
  },
};

function isComposite(type: TokenType): type is CompositeType {
  return type in FIELDS;
}

/** Trecho do valor para a mensagem. */
function show(value: TokenValue): string {
  const text = JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

interface Issue {
  severity: TokenDiagnostic['severity'];
  message: string;
}

/**
 * Confere um valor do tipo. `raw` é o mesmo valor antes da resolução: num
 * campo que é alias, o token apontado precisa ser do tipo do campo.
 */
function checkValue(type: TokenType, value: TokenValue, raw: TokenValue, typeOf: (path: string) => string | undefined): Issue[] {
  if (!isComposite(type)) {
    return PRIMITIVE[type](value) ? [] : [{ severity: 'error', message: `${show(value)} não é ${DESCRIBE[type]}.` }];
  }
  const fields = FIELDS[type];
  const checkObject = (obj: TokenValue, rawObj: TokenValue, where: string): Issue[] => {
    if (!isObject(obj)) {
      return [{ severity: 'error', message: `${where}deve ser um objeto com ${Object.keys(fields).join(', ')}.` }];
    }
    const rawFields = isObject(rawObj) ? rawObj : {};
    const issues: Issue[] = [];
    for (const [name, spec] of Object.entries(fields)) {
      if (!(name in obj)) {
        if (!spec.optional) issues.push({ severity: 'warning', message: `${where}campo "${name}" ausente.` });
        continue;
      }
      const ref = aliasTarget(rawFields[name] ?? null);
      const refType = ref === undefined ? undefined : typeOf(ref);
      if (refType !== undefined && !(spec.kinds as string[]).includes(refType)) {
        issues.push({ severity: 'error', message: `${where}campo "${name}" aponta para {${ref}}, que é ${refType}.` });
      } else if (!spec.kinds.some((kind) => PRIMITIVE[kind](obj[name]!))) {
        const expected = spec.kinds.map((kind) => DESCRIBE[kind]).join(' ou ');
        issues.push({ severity: 'error', message: `${where}campo "${name}": ${show(obj[name]!)} não é ${expected}.` });
      }
    }
    for (const name of Object.keys(obj)) {
      if (!(name in fields)) issues.push({ severity: 'warning', message: `${where}campo "${name}" não faz parte de ${type}; ignorado.` });
    }
    return issues;
  };

  // Sombra: um objeto ou uma lista deles (várias sombras). Gradiente: lista de paradas.
  if (type === 'shadow' && !Array.isArray(value)) return checkObject(value, raw, '');
  if (type === 'shadow' || type === 'gradient') {
    if (!Array.isArray(value) || !value.length) {
      return [{ severity: 'error', message: `${type === 'shadow' ? 'a sombra' : 'o gradiente'} deve ser ${type === 'shadow' ? 'um objeto ou ' : ''}uma lista não vazia.` }];
    }
    const rawItems = Array.isArray(raw) ? raw : [];
    return value.flatMap((item, i) => checkObject(item, rawItems[i] ?? null, `item ${i + 1}: `));
  }
  return checkObject(value, raw, '');
}

export interface ValidatedTokens {
  tokens: Token[];
  diagnostics: TokenDiagnostic[];
}

export function validateTokens(tokens: readonly ResolvedToken[], modes: readonly string[]): ValidatedTokens {
  const bag = new TokenDiagnosticBag();
  const index = new Map(tokens.map((t) => [t.path, t]));
  const typeOf = (path: string) => index.get(path)?.type;
  /** Erro de cada token reprovado, emitido no fim, na ordem dos arquivos. */
  const errors = new Map<string, string>();

  for (const token of tokens) {
    const inMode = (mode: string) => (modes.length > 1 ? ` (modo ${mode})` : '');
    if (token.type === undefined) {
      errors.set(token.path, 'sem "$type" — declare no token ou num grupo acima dele.');
      continue;
    }
    if (!isTokenType(token.type)) {
      errors.set(token.path, `"$type" desconhecido: "${token.type}"${didYouMean(token.type, TOKEN_TYPES)}.`);
      continue;
    }
    const warned = new Set<string>();
    for (const mode of modes) {
      const { value, resolvedValue } = token.byMode[mode]!;
      const issues = checkValue(token.type, resolvedValue, value, typeOf);
      const error = issues.find((i) => i.severity === 'error');
      if (error) {
        errors.set(token.path, `${error.message.replace(/\.$/, '')}${inMode(mode)}.`);
        break;
      }
      for (const { message } of issues) {
        // Mesmo aviso em todos os modos (o campo falta no base): uma vez só.
        if (warned.has(message)) continue;
        warned.add(message);
        bag.warning(token.file, token.path, message);
      }
    }
  }

  // Quem aponta para um reprovado — no valor inteiro ou num campo de valor
  // composto — herdou o valor inválido: a mensagem aponta a causa, e quem
  // ainda passava cai junto, até nada mais mudar.
  const failedAlias = (token: ResolvedToken) =>
    modes.flatMap((m) => aliasesIn(token.byMode[m]!.value)).find((ref) => errors.has(ref));
  const failedOnOwn = [...errors.keys()];
  for (const path of failedOnOwn) {
    const ref = failedAlias(index.get(path)!);
    if (ref !== undefined) errors.set(path, `o alias {${ref}} aponta para um token com erro.`);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const token of tokens) {
      if (errors.has(token.path)) continue;
      const ref = failedAlias(token);
      if (ref !== undefined) {
        errors.set(token.path, `o alias {${ref}} aponta para um token com erro.`);
        changed = true;
      }
    }
  }

  const valid: Token[] = [];
  for (const token of tokens) {
    const error = errors.get(token.path);
    if (error !== undefined) {
      bag.error(token.file, token.path, error);
      continue;
    }
    const result: Token = { path: token.path, type: token.type as TokenType, byMode: token.byMode };
    if (token.description !== undefined) result.description = token.description;
    if (token.deprecated !== undefined) result.deprecated = token.deprecated;
    valid.push(result);
  }
  // Avisos e erros juntos, na ordem dos tokens.
  const order = new Map(tokens.map((t, i) => [t.path, i]));
  const diagnostics = [...bag.items].sort((a, b) => order.get(a.path!)! - order.get(b.path!)!);
  return { tokens: valid, diagnostics };
}
