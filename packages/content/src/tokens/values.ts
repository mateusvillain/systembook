import type { TokenValue } from '@systembook/schema';

/**
 * O que a validação e a conversão para CSS precisam concordar sobre os valores
 * de token — um lugar só, para um peso ou espaço de cor novo entrar nos dois.
 */

export type JsonObject = { [key: string]: TokenValue };

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Pesos por nome → número. Chaves sem espaço, hífen nem caixa (ver `weightKey`). */
export const FONT_WEIGHTS: Readonly<Record<string, number>> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
  extrablack: 950,
  ultrablack: 950,
};

/** "Semi Bold", "semi-bold" e "SemiBold" são o mesmo peso. */
export const weightKey = (name: string) => name.toLowerCase().replace(/[\s_-]/g, '');

/** Espaços de cor que o CSS escreve com `color(espaço …)`. */
export const PREDEFINED_COLOR_SPACES = new Set([
  'srgb',
  'srgb-linear',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz',
  'xyz-d50',
  'xyz-d65',
]);

/** Espaços com função CSS própria (`oklch(…)`). */
export const FUNCTION_COLOR_SPACES = new Set(['hsl', 'hwb', 'lab', 'lch', 'oklab', 'oklch']);
