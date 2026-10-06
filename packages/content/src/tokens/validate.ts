import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { didYouMean } from '../diagnostics.js';
import { sortByTokenOrder, TokenDiagnosticBag } from './diagnostics.js';
import { aliasesIn, aliasTarget, cascadeFailures, failedAliasMessage } from './resolve.js';
import type { ResolvedToken, ValidatedTokens } from './types.js';

/**
 * Validação de tokens (SYS-126): `$type` conhecido e valor no formato do tipo,
 * em cada modo, sobre o valor já resolvido.
 *
 * O Systembook documenta tokens que já existem, então aceita as formas que os
 * exportadores reais geram — texto (`"#0a84ff"`, `"16px"`), a de objeto da
 * spec 2025.10, número puro em dimensão (px) e duração (ms), nomes de peso em
 * qualquer grafia (`"SemiBold"`) — e recusa o que não dá para mostrar.
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

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCTION = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(.+\)$/i;
const NAMED_COLORS = words(`
  transparent currentcolor aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
  blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue
  darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid
  darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
  deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold
  goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush
  lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
  lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
  limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise
  palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
  saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow
  springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
`);
const COLOR_SPACES = words(
  'srgb srgb-linear hsl hwb lab lch oklab oklch display-p3 a98-rgb prophoto-rgb rec2020 xyz xyz-d50 xyz-d65',
);
const LENGTH_UNITS = words('px rem em % vh vw vmin vmax svh lvh dvh svw lvw dvw ch ex cap ic lh rlh cm mm q in pt pc');
const DIMENSION = /^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z]+|%)?$/i;
const DURATION = /^(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)$/;
/** Pesos sem espaço, hífen nem caixa: "Semi Bold", "semi-bold" e "SemiBold" são o mesmo. */
const FONT_WEIGHTS = words(
  'thin hairline extralight ultralight light normal regular book medium semibold demibold bold extrabold ultrabold black heavy extrablack ultrablack',
);
const EASINGS = words('linear ease ease-in ease-out ease-in-out');
const STROKE_STYLES = words('solid dashed dotted double groove ridge outset inset');
const LINE_CAPS = words('round butt square');

function isDimension(v: TokenValue): boolean {
  if (isNumber(v)) return true;
  if (typeof v === 'string') {
    const match = DIMENSION.exec(v);
    return match !== null && (match[2] === undefined || LENGTH_UNITS.has(match[2].toLowerCase()));
  }
  return isObject(v) && isNumber(v.value) && typeof v.unit === 'string' && LENGTH_UNITS.has(v.unit);
}

/** Validador e descrição de cada tipo sem campos — um lugar só por tipo. */
const KINDS = {
  color: {
    describe: 'uma cor ("#0a84ff", "rgb(…)", um nome CSS ou { colorSpace, components })',
    check: (v: TokenValue) =>
      typeof v === 'string'
        ? HEX.test(v) || COLOR_FUNCTION.test(v) || NAMED_COLORS.has(v.toLowerCase())
        : isObject(v) &&
          typeof v.colorSpace === 'string' &&
          COLOR_SPACES.has(v.colorSpace) &&
          Array.isArray(v.components) &&
          v.components.length === 3 &&
          v.components.every((c) => isNumber(c) || c === 'none') &&
          (v.alpha === undefined || (isNumber(v.alpha) && v.alpha >= 0 && v.alpha <= 1)) &&
          (v.hex === undefined || (typeof v.hex === 'string' && HEX.test(v.hex))),
  },
  dimension: { describe: 'uma dimensão ("16px", 16 ou { value, unit })', check: isDimension },
  fontFamily: {
    describe: 'uma família de fonte (texto ou lista de textos)',
    check: (v: TokenValue) =>
      typeof v === 'string'
        ? v.trim() !== ''
        : Array.isArray(v) && v.length > 0 && v.every((f) => typeof f === 'string' && f.trim() !== ''),
  },
  fontWeight: {
    describe: 'um peso de fonte (1 a 1000 ou um nome como "bold")',
    check: (v: TokenValue) => {
      const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
      if (isNumber(n)) return n >= 1 && n <= 1000;
      return typeof n === 'string' && FONT_WEIGHTS.has(n.toLowerCase().replace(/[\s_-]/g, ''));
    },
  },
  duration: {
    describe: 'uma duração ("200ms", 200 ou { value, unit })',
    check: (v: TokenValue) =>
      isNumber(v)
        ? v >= 0
        : typeof v === 'string'
          ? DURATION.test(v)
          : isObject(v) && isNumber(v.value) && v.value >= 0 && (v.unit === 'ms' || v.unit === 's'),
  },
  cubicBezier: {
    describe: 'uma curva [x1, y1, x2, y2] com x1 e x2 entre 0 e 1, ou "ease"/"linear"…',
    check: (v: TokenValue) =>
      typeof v === 'string'
        ? EASINGS.has(v)
        : Array.isArray(v) && v.length === 4 && v.every(isNumber) && [v[0]!, v[2]!].every((x) => x >= 0 && x <= 1),
  },
  number: { describe: 'um número', check: isNumber },
  strokeStyle: {
    describe: 'um estilo de traço ("solid", "dashed"… ou { dashArray, lineCap })',
    check: (v: TokenValue) =>
      typeof v === 'string'
        ? STROKE_STYLES.has(v.toLowerCase())
        : isObject(v) &&
          Array.isArray(v.dashArray) &&
          v.dashArray.length > 0 &&
          v.dashArray.every(isDimension) &&
          typeof v.lineCap === 'string' &&
          LINE_CAPS.has(v.lineCap),
  },
  // Campos que não são um tipo de token: `shadow.inset` e `gradient[].position`.
  boolean: { describe: 'true ou false', check: (v: TokenValue) => typeof v === 'boolean' },
  position: {
    describe: 'uma posição de 0 a 1 (ou "50%")',
    check: (v: TokenValue) =>
      isNumber(v) ? v >= 0 && v <= 1 : typeof v === 'string' && /^(?:100|\d{1,2}(?:\.\d+)?)%$/.test(v),
  },
} satisfies Record<string, { describe: string; check: (v: TokenValue) => boolean }>;

type Kind = keyof typeof KINDS;

interface FieldSpec {
  kinds: Kind[];
  optional?: boolean;
}

/** Campos de cada tipo composto (no `shadow` e no `gradient`, de cada item). */
const FIELDS = {
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
  gradient: { color: { kinds: ['color'] }, position: { kinds: ['position'] } },
  typography: {
    fontFamily: { kinds: ['fontFamily'] },
    fontSize: { kinds: ['dimension'] },
    fontWeight: { kinds: ['fontWeight'] },
    letterSpacing: { kinds: ['dimension'] },
    // A spec pede número; altura de linha em dimensão ("24px") é comum demais para recusar.
    lineHeight: { kinds: ['number', 'dimension'] },
  },
} satisfies Partial<Record<TokenType, Record<string, FieldSpec>>>;

type CompositeType = keyof typeof FIELDS;

// Todo tipo de token tem validador: é primitivo (KINDS) ou composto (FIELDS).
const _assertEveryTypeChecked: [Exclude<TokenType, Kind | CompositeType>] extends [never] ? true : never = true;

function isComposite(type: TokenType): type is CompositeType {
  return type in FIELDS;
}

/** Um token de `refType` pode preencher um campo de `kind`? */
function fits(kind: Kind, refType: string): boolean {
  return kind === refType || (kind === 'position' && refType === 'number');
}

/** Trecho do valor para a mensagem. */
function show(value: TokenValue): string {
  const text = JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

interface Issues {
  errors: string[];
  warnings: string[];
}

/**
 * Confere um valor do tipo. `raw` é o mesmo valor antes da resolução: num
 * campo que é alias, o token apontado precisa ser do tipo do campo.
 */
function checkValue(
  type: TokenType,
  value: TokenValue,
  raw: TokenValue,
  typeOf: (path: string) => string | undefined,
): Issues {
  const issues: Issues = { errors: [], warnings: [] };
  if (!isComposite(type)) {
    if (!KINDS[type].check(value)) issues.errors.push(`${show(value)} não é ${KINDS[type].describe}`);
    return issues;
  }
  const fields: Record<string, FieldSpec> = FIELDS[type];
  const names = Object.keys(fields);

  const checkObject = (obj: TokenValue, rawObj: TokenValue, where: string) => {
    if (!isObject(obj)) {
      issues.errors.push(`${where}deve ser um objeto com ${names.join(', ')}`);
      return;
    }
    if (!names.some((name) => name in obj)) {
      issues.errors.push(`${where}nenhum campo de ${type} (${names.join(', ')})`);
      return;
    }
    const rawFields = isObject(rawObj) ? rawObj : {};
    for (const [name, spec] of Object.entries(fields)) {
      if (!(name in obj)) {
        if (!spec.optional) issues.warnings.push(`${where}campo "${name}" ausente`);
        continue;
      }
      const ref = aliasTarget(rawFields[name] ?? null);
      const refType = ref === undefined ? undefined : typeOf(ref);
      if (refType !== undefined && !spec.kinds.some((kind) => fits(kind, refType))) {
        issues.errors.push(`${where}campo "${name}" aponta para {${ref}}, que é ${refType}`);
      } else if (!spec.kinds.some((kind) => KINDS[kind].check(obj[name]!))) {
        const expected = spec.kinds.map((kind) => KINDS[kind].describe).join(' ou ');
        issues.errors.push(`${where}campo "${name}": ${show(obj[name]!)} não é ${expected}`);
      }
    }
    for (const name of Object.keys(obj)) {
      if (!(name in fields)) issues.warnings.push(`${where}campo "${name}" não faz parte de ${type}; ignorado`);
    }
  };

  const rawItems = Array.isArray(raw) ? raw : [];
  const checkItems = (items: TokenValue[]) =>
    items.forEach((item, i) => checkObject(item, rawItems[i] ?? null, items.length > 1 ? `item ${i + 1}: ` : ''));

  if (type === 'shadow') {
    // Uma sombra, ou uma lista delas (várias sombras empilhadas).
    if (!Array.isArray(value)) checkObject(value, raw, '');
    else if (!value.length) issues.errors.push('a lista de sombras está vazia');
    else checkItems(value);
  } else if (type === 'gradient') {
    if (!Array.isArray(value) || !value.length) {
      issues.errors.push('o gradiente deve ser uma lista não vazia de { color, position }');
    } else {
      checkItems(value);
    }
  } else {
    checkObject(value, raw, '');
  }
  return issues;
}

export function validateTokens(tokens: readonly ResolvedToken[], modes: readonly string[]): ValidatedTokens {
  const bag = new TokenDiagnosticBag();
  const index = new Map(tokens.map((t) => [t.path, t]));
  const typeOf = (path: string) => index.get(path)?.type;
  /** Sufixo com os modos em que o problema aparece; nenhum com um modo só. */
  const inModes = (list: string[]) =>
    modes.length > 1 ? ` (${list.length > 1 ? 'modos' : 'modo'} ${list.join(', ')})` : '';
  /** Agrupa as mensagens iguais entre modos: mensagem → modos. */
  const collect = (map: Map<string, string[]>, messages: string[], mode: string) => {
    for (const message of messages) map.set(message, [...(map.get(message) ?? []), mode]);
  };

  const types = new Map<string, TokenType>();
  /** Erros de cada token reprovado — todos de uma vez, para corrigir numa rodada. */
  const errors = new Map<string, { file: string; message: string }[]>();
  /** Avisos de cada token; só saem para os que ficam no conjunto. */
  const warnings = new Map<string, string[]>();
  const failWith = (token: ResolvedToken, message: string) => errors.set(token.path, [{ file: token.file, message }]);

  for (const token of tokens) {
    if (token.type === undefined) {
      failWith(token, 'sem "$type" — declare no token ou num grupo acima dele.');
      continue;
    }
    if (!isTokenType(token.type)) {
      failWith(token, `"$type" desconhecido: "${token.type}"${didYouMean(token.type, TOKEN_TYPES)}.`);
      continue;
    }
    types.set(token.path, token.type);
    const errorModes = new Map<string, string[]>();
    const warningModes = new Map<string, string[]>();
    for (const mode of modes) {
      const { value, resolvedValue } = token.byMode[mode]!;
      const issues = checkValue(token.type, resolvedValue, value, typeOf);
      collect(errorModes, issues.errors, mode);
      collect(warningModes, issues.warnings, mode);
    }
    if (errorModes.size) {
      // O erro de um modo aponta o arquivo de onde veio o valor dele.
      const list = [...errorModes].map(([message, where]) => ({
        file: token.fileByMode[where[0]!]!,
        message: `${message}${inModes(where)}.`,
      }));
      errors.set(token.path, list);
    }
    // Aviso que vem do base aparece em todos os modos: sai uma vez, sem sufixo.
    const list = [...warningModes].map(([message, where]) => `${message}${where.length === modes.length ? '' : inModes(where)}.`);
    warnings.set(token.path, list);
  }

  // Quem aponta para um reprovado — no valor inteiro ou num campo de valor
  // composto — herdou o valor inválido: a mensagem aponta a causa, e quem
  // ainda passava cai junto.
  const refsOf = (token: ResolvedToken) => modes.flatMap((m) => aliasesIn(token.byMode[m]!.value));
  for (const path of [...errors.keys()]) {
    const token = index.get(path)!;
    const ref = refsOf(token).find((r) => errors.has(r));
    if (ref !== undefined) failWith(token, `${failedAliasMessage(ref)}.`);
  }
  cascadeFailures(tokens, refsOf, (path) => errors.has(path), (token, ref) => failWith(token, `${failedAliasMessage(ref)}.`));

  const valid: Token[] = [];
  for (const token of tokens) {
    const tokenErrors = errors.get(token.path);
    if (tokenErrors) {
      for (const { file, message } of tokenErrors) bag.error(file, token.path, message);
      continue;
    }
    for (const message of warnings.get(token.path) ?? []) bag.warning(token.file, token.path, message);
    const result: Token = { path: token.path, type: types.get(token.path)!, byMode: token.byMode };
    if (token.description !== undefined) result.description = token.description;
    if (token.deprecated !== undefined) result.deprecated = token.deprecated;
    valid.push(result);
  }
  return { tokens: valid, diagnostics: sortByTokenOrder(bag.items, tokens.map((t) => t.path)) };
}
