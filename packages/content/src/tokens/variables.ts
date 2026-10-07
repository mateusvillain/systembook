import type { TokenSet } from '@systembook/schema';
import { toCssValue } from './css.js';
import { toCssVar } from './names.js';

/**
 * `TokenSet` → folha de estilo com as variáveis CSS (SYS-146), que o preview
 * injeta no iframe. Um bloco por modo, com os valores resolvidos: o primeiro
 * modo vale em `:root`, e cada modo também vale num elemento com
 * `data-mode="<modo>"` — trocar o atributo no `<html>` troca os valores, e um
 * trecho com outro modo dentro da página também funciona.
 *
 * Todo bloco traz todos os tokens (não só os que mudam), para um modo aninhado
 * nunca herdar o valor do modo de fora.
 */

/** Atributo que escolhe o modo dos tokens num elemento. */
export const TOKEN_MODE_ATTRIBUTE = 'data-mode';

/** Seletor de atributo com o modo como string CSS (aspas, barra e quebra de linha escapadas). */
export function tokenModeSelector(mode: string): string {
  const escaped = mode.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ').replace(/\r/g, '\\d ');
  return `[${TOKEN_MODE_ATTRIBUTE}="${escaped}"]`;
}

/**
 * Valor que fecharia a declaração ou o bloco antes da hora. A validação não
 * deixa passar nada assim; a checagem é a última barreira de quem injeta o CSS.
 */
const UNSAFE_VALUE = /[{};\n\r]|\/\*/;

export function tokensToCss(set: TokenSet): string {
  return set.modes
    .map((mode, i) => {
      const selector = i === 0 ? `:root, ${tokenModeSelector(mode)}` : tokenModeSelector(mode);
      const declarations = set.tokens.flatMap((token) => {
        const entry = token.byMode[mode];
        const value = entry && toCssValue(token.type, entry.resolvedValue);
        return value && !UNSAFE_VALUE.test(value) ? [`  ${toCssVar(token.path)}: ${value};`] : [];
      });
      return `${selector} {\n${declarations.join('\n')}\n}`;
    })
    .join('\n\n');
}
