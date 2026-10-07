import type { TokenType, TokenValue } from '@systembook/schema';
import { FONT_WEIGHTS, FUNCTION_COLOR_SPACES, isNumber, isObject, PREDEFINED_COLOR_SPACES, weightKey } from './values.js';

/**
 * Valor resolvido de um token → valor CSS (SYS-133): o que a doc mostra ao lado
 * da amostra e o que a amostra aplica. As duas formas que o validador aceita
 * viram CSS — texto (`"#0a84ff"`, `"16px"`), número puro (px em dimensão, ms
 * em duração) e a forma de objeto da spec 2025.10. O preview (Epic 5) usa a
 * mesma conversão para as variáveis CSS.
 *
 * Recebe valores já validados; o que não reconhece vira `null`, e quem chama
 * mostra o JSON.
 */

/** Número sem ruído de ponto flutuante (`0.30000000000000004` → `0.3`). */
const num = (n: number) => String(Number(n.toFixed(4)));

function color(v: TokenValue): string | null {
  if (typeof v === 'string') return v;
  if (!isObject(v) || typeof v.colorSpace !== 'string' || !Array.isArray(v.components)) return null;
  const alpha = isNumber(v.alpha) && v.alpha < 1 ? ` / ${num(v.alpha)}` : '';
  const components = v.components.map((c, i) => {
    if (!isNumber(c)) return 'none';
    return (v.colorSpace === 'hsl' || v.colorSpace === 'hwb') && i > 0 ? `${num(c)}%` : num(c);
  });
  if (PREDEFINED_COLOR_SPACES.has(v.colorSpace)) return `color(${v.colorSpace} ${components.join(' ')}${alpha})`;
  if (FUNCTION_COLOR_SPACES.has(v.colorSpace)) return `${v.colorSpace}(${components.join(' ')}${alpha})`;
  return typeof v.hex === 'string' ? v.hex : null;
}

/** Zero sem unidade só vale em comprimento: `<time>` exige `0ms`. */
function measure(v: TokenValue, unit: 'px' | 'ms'): string | null {
  if (typeof v === 'string') return v;
  if (isNumber(v)) return v === 0 && unit === 'px' ? '0' : `${num(v)}${unit}`;
  if (isObject(v) && isNumber(v.value) && typeof v.unit === 'string') return `${num(v.value)}${v.unit}`;
  return null;
}

/** Texto como string CSS entre aspas: aspas, barra e quebras de linha escapadas. */
export const cssString = (text: string) =>
  `"${text.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ').replace(/\r/g, '\\d ')}"`;

/** Nome de família com espaço vai entre aspas; genéricas (`sans-serif`) não. */
function fontFamily(v: TokenValue): string | null {
  const list = typeof v === 'string' ? [v] : Array.isArray(v) ? v : null;
  if (!list?.every((f): f is string => typeof f === 'string')) return null;
  return list.map((f) => (/^[\w-]+$/.test(f) ? f : cssString(f))).join(', ');
}

function fontWeight(v: TokenValue): string | null {
  if (isNumber(v)) return String(v);
  if (typeof v !== 'string') return null;
  if (/^\d+$/.test(v)) return v;
  const weight = FONT_WEIGHTS[weightKey(v)];
  return weight === undefined ? null : String(weight);
}

function cubicBezier(v: TokenValue): string | null {
  if (typeof v === 'string') return v;
  return Array.isArray(v) && v.length === 4 && v.every(isNumber) ? `cubic-bezier(${v.map(num).join(', ')})` : null;
}

/** `dashArray` não tem CSS equivalente num `border-style`: vira `dashed`. */
function strokeStyle(v: TokenValue): string | null {
  if (typeof v === 'string') return v.toLowerCase();
  return isObject(v) ? 'dashed' : null;
}

/** Junta as partes; qualquer uma `null` torna o todo `null`. */
const join = (parts: (string | null)[], separator = ' ') =>
  parts.every((p): p is string => p !== null) ? parts.join(separator) : null;

function shadow(v: TokenValue): string | null {
  const one = (s: TokenValue) =>
    isObject(s)
      ? join([
          s.inset === true ? 'inset' : '',
          measure(s.offsetX ?? null, 'px'),
          measure(s.offsetY ?? null, 'px'),
          measure(s.blur ?? 0, 'px'),
          measure(s.spread ?? 0, 'px'),
          color(s.color ?? null),
        ])?.trim() ?? null
      : null;
  return Array.isArray(v) ? join(v.map(one), ', ') : one(v);
}

function gradient(v: TokenValue): string | null {
  if (!Array.isArray(v)) return null;
  const stops = v.map((stop) => {
    if (!isObject(stop)) return null;
    const position = isNumber(stop.position) ? `${num(stop.position * 100)}%` : typeof stop.position === 'string' ? stop.position : null;
    return join([color(stop.color ?? null), position]);
  });
  const list = join(stops, ', ');
  // O DTCG não guarda direção: os 90deg são só para a amostra mostrar as paradas.
  return list === null ? null : `linear-gradient(90deg, ${list})`;
}

/** Altura de linha: número puro fica sem unidade (relativo à fonte); dimensão como dimensão. */
const lineHeight = (v: TokenValue) => (isNumber(v) ? num(v) : measure(v, 'px'));

/** Campo DTCG da tipografia → propriedade CSS e conversão. */
const TYPOGRAPHY_FIELDS: [field: string, property: string, convert: (v: TokenValue) => string | null][] = [
  ['fontFamily', 'font-family', fontFamily],
  ['fontSize', 'font-size', (v) => measure(v, 'px')],
  ['fontWeight', 'font-weight', fontWeight],
  ['letterSpacing', 'letter-spacing', (v) => measure(v, 'px')],
  ['lineHeight', 'line-height', lineHeight],
];

/** Estilo de uma tipografia, nas chaves do CSSOM — as mesmas dos campos do DTCG. */
export interface TypographyStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  letterSpacing?: string;
  lineHeight?: string;
}

/**
 * Os campos de uma tipografia em CSS, só os que convertem — para a amostra
 * aplicar direto num `style`.
 */
export function typographyStyle(value: TokenValue): TypographyStyle {
  if (!isObject(value)) return {};
  const style: Record<string, string> = {};
  for (const [field, , convert] of TYPOGRAPHY_FIELDS) {
    const css = convert(value[field] ?? null);
    if (css !== null) style[field] = css;
  }
  return style;
}

/**
 * `font` não carrega `letter-spacing`: a amostra e o fallback usam os campos um
 * a um, e o preview ganha uma variável por campo (`typographyProperties`).
 * Tamanho e família são obrigatórios no `font`; peso e altura de linha podem
 * faltar, mas um campo presente que não converte torna o todo `null`.
 */
function typography(v: TokenValue): string | null {
  if (!isObject(v)) return null;
  const s = typographyStyle(v);
  const invalid = TYPOGRAPHY_FIELDS.some(([field]) => v[field] !== undefined && s[field as keyof TypographyStyle] === undefined);
  if (invalid || !s.fontSize || !s.fontFamily) return null;
  const size = s.lineHeight ? `${s.fontSize}/${s.lineHeight}` : s.fontSize;
  return join([s.fontWeight ?? '', size, s.fontFamily])!.trim();
}

/** Os campos de uma tipografia que convertem, como pares propriedade CSS → valor. */
export function typographyProperties(value: TokenValue): [property: string, css: string][] {
  const style = typographyStyle(value);
  return TYPOGRAPHY_FIELDS.flatMap(([field, property]) => {
    const css = style[field as keyof TypographyStyle];
    return css === undefined ? [] : [[property, css] as [string, string]];
  });
}

const CONVERT: Record<TokenType, (v: TokenValue) => string | null> = {
  color,
  dimension: (v) => measure(v, 'px'),
  fontFamily,
  fontWeight,
  duration: (v) => measure(v, 'ms'),
  cubicBezier,
  number: (v) => (isNumber(v) ? num(v) : null),
  strokeStyle,
  border: (v) => (isObject(v) ? join([measure(v.width ?? null, 'px'), strokeStyle(v.style ?? null), color(v.color ?? null)]) : null),
  transition: (v) =>
    isObject(v)
      ? join([measure(v.duration ?? null, 'ms'), cubicBezier(v.timingFunction ?? null), measure(v.delay ?? 0, 'ms')])
      : null,
  shadow,
  gradient,
  typography,
};

/**
 * `null` também para um tipo fora de `TokenType` — um `TokenSet` gerado por uma
 * versão mais nova do schema não pode derrubar a tabela que o mostra.
 */
export function toCssValue(type: TokenType, value: TokenValue): string | null {
  return CONVERT[type]?.(value) ?? null;
}

/** Linhas dos tipos em que uma linha só esconderia algo; os outros cabem em `toCssValue`. */
const LINES: Partial<Record<TokenType, (v: TokenValue) => string[] | null>> = {
  // As cinco propriedades sempre: campo faltando é "—", campo que não converte
  // aparece cru — sumir com eles esconderia o problema de quem lê.
  typography: (v) =>
    isObject(v)
      ? TYPOGRAPHY_FIELDS.map(([field, property, convert]) => {
          const raw = v[field];
          return `${property}: ${raw === undefined ? '—' : (convert(raw) ?? JSON.stringify(raw))}`;
        })
      : null,
  shadow: (v) => {
    if (!Array.isArray(v) || v.length < 2) return null;
    const layers = v.map((layer) => shadow(layer));
    return layers.every((l): l is string => l !== null) ? layers : null;
  },
  // `dashArray` não cabe num `border-style`; em SVG ele tem propriedade própria.
  strokeStyle: (v) => {
    if (!isObject(v) || !Array.isArray(v.dashArray)) return null;
    const dashes = join(v.dashArray.map((d) => measure(d, 'px')));
    if (dashes === null) return null;
    return typeof v.lineCap === 'string' ? [`stroke-dasharray: ${dashes}`, `stroke-linecap: ${v.lineCap}`] : [`stroke-dasharray: ${dashes}`];
  },
};

/**
 * O valor em mais de uma linha, quando uma linha só esconderia algo: a
 * tipografia (o `font` perde o `letter-spacing`), as camadas de uma sombra e o
 * traço com `dashArray` (que vira `dashed` no CSS). `null` para o resto, que
 * cabe numa linha (`toCssValue`).
 */
export function toCssLines(type: TokenType, value: TokenValue): string[] | null {
  return LINES[type]?.(value) ?? null;
}
