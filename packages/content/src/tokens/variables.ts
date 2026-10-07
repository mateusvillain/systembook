import type { Token, TokenModeAttribute, TokenSet } from '@systembook/schema';
import { cssString, toCssValue, typographyProperties } from './css.js';
import { toCssVar } from './names.js';

/**
 * `TokenSet` → folha de estilo com as variáveis CSS (SYS-146), que o preview
 * injeta no iframe. Um bloco por modo, com os valores resolvidos: o primeiro
 * modo vale em `:root`, e cada modo também vale num elemento com
 * `data-mode="<modo>"` — trocar o atributo no `<html>` troca os valores, e um
 * trecho com outro modo dentro da página também funciona. Os blocos saem na
 * ordem dos modos: `:root` e `[data-mode]` têm a mesma especificidade, então
 * um modo no `<html>` vence o primeiro por vir depois.
 *
 * Todo bloco traz todos os tokens (não só os que mudam), para um modo aninhado
 * nunca herdar o valor do modo de fora.
 */

/** Atributo que escolhe o modo dos tokens num elemento; o preview-kit o põe no `<html>`. */
export const TOKEN_MODE_ATTRIBUTE: TokenModeAttribute = 'data-mode';

export function tokenModeSelector(mode: string): string {
  return `[${TOKEN_MODE_ATTRIBUTE}=${cssString(mode)}]`;
}

/**
 * Valor que escaparia da própria declaração: chave, `;`, comentário, quebra de
 * linha, `<` (um `</style>`), barra solta (escaparia o `;` que fecha) ou aspa
 * sem par (engoliria a declaração seguinte). A validação não deixa passar nada
 * assim; a checagem é a última barreira de quem injeta o CSS.
 */
function isSafeValue(value: string): boolean {
  if (/[{};<\n\r]|\/\*/.test(value)) return false;
  const unescaped = value.replace(/\\./g, '');
  if (unescaped.includes('\\')) return false;
  return [`"`, `'`].every((quote) => unescaped.split(quote).length % 2 === 1);
}

/**
 * As declarações de um token num modo. A tipografia ganha, além do `font`, uma
 * variável por campo (`--font-body-letter-spacing`) — o `font` não carrega o
 * `letter-spacing`, e o componente pode querer um campo só.
 */
function declarations(token: Token, mode: string): [name: string, value: string][] {
  const entry = token.byMode[mode];
  if (!entry) return [];
  const name = toCssVar(token.path);
  const value = toCssValue(token.type, entry.resolvedValue);
  const fields =
    token.type === 'typography'
      ? typographyProperties(entry.resolvedValue).map(([property, css]): [string, string] => [`${name}-${property}`, css])
      : [];
  return [...(value === null ? [] : [[name, value] as [string, string]]), ...fields];
}

export function tokensToCss(set: TokenSet): string {
  return set.modes
    .map((mode, i) => {
      const selector = i === 0 ? `:root, ${tokenModeSelector(mode)}` : tokenModeSelector(mode);
      const lines = set.tokens
        .flatMap((token) => declarations(token, mode))
        .filter(([, value]) => isSafeValue(value))
        .map(([name, value]) => `  ${name}: ${value};\n`);
      return `${selector} {\n${lines.join('')}}`;
    })
    .join('\n\n');
}
