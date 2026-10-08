import type { Token } from '@systembook/schema';
import { TokenSample } from './TokenSample.js';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/** `number` não diz o que mede: opacidade é o caminho com uma destas palavras inteiras. */
const OPACITY_WORDS = new Set(['opacity', 'alpha']);

const isOpacityToken = (token: Token) =>
  token.path
    .split('.')
    .flatMap((segment) => segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_-]+/))
    .some((w) => OPACITY_WORDS.has(w));

/**
 * Tokens numéricos (SYS-150). Opacidade ganha um quadrado com a cor de destaque
 * naquela opacidade, sobre xadrez — o quanto se vê através dele. Os outros
 * números (z-index, multiplicadores) não têm amostra honesta: só o valor.
 */
export function NumberTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(token, _mode, css) => {
        if (css === null || token.type !== 'number' || !isOpacityToken(token)) return null;
        const n = Number(css);
        return n >= 0 && n <= 1 ? <TokenSample kind="opacity" value={css} /> : null;
      }}
    />
  );
}
