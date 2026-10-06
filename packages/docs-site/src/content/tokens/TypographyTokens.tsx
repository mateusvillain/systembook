import type { CSSProperties } from 'react';
import type { Token, TokenType } from '@systembook/schema';
import { typographyStyle } from '@systembook/content/tokens';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/**
 * Texto da amostra: ascendentes, descendentes e as letras que mais mudam entre
 * fontes, longo o bastante para quebrar em duas linhas — e a altura de linha
 * aparecer.
 */
const SAMPLE = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';

/** O estilo da amostra por tipo: a tipografia inteira, ou só a família ou o peso. */
const SAMPLE_STYLE: Partial<Record<TokenType, (token: Token, mode: string, css: string | null) => CSSProperties | null>> = {
  typography: (token, mode) => {
    const style = typographyStyle(token.byMode[mode]!.resolvedValue);
    return Object.keys(style).length ? style : null;
  },
  fontFamily: (_token, _mode, css) => (css === null ? null : { fontFamily: css }),
  fontWeight: (_token, _mode, css) => (css === null ? null : { fontWeight: css }),
};

/**
 * Tokens de tipografia (SYS-134): `typography` (o composto inteiro),
 * `fontFamily` e `fontWeight`, com uma frase de amostra por modo. A amostra é
 * decorativa — os valores vêm escritos ao lado. A fonte precisa estar
 * disponível na página para aparecer; sem ela, o navegador cai na próxima da
 * lista, como no produto.
 */
export function TypographyTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(token, mode, css) => {
        const style = SAMPLE_STYLE[token.type]?.(token, mode, css);
        return style ? (
          <span className="sb-token-type-sample" aria-hidden style={style}>
            {SAMPLE}
          </span>
        ) : null;
      }}
    />
  );
}
