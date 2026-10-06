import type { CSSProperties } from 'react';
import type { Token } from '@systembook/schema';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/**
 * O tipo `dimension` não diz se é espaço ou raio: o caminho diz
 * (`radius.md`, `rounded.full`, `corner.sm`). O resto é tratado como medida.
 */
const RADIUS = /radius|rounded|corner/i;

const isRadiusToken = (token: Token) => token.path.split('.').some((segment) => RADIUS.test(segment));

/**
 * Tokens de dimensão (SYS-135): espaçamento como uma barra com a largura do
 * valor (limitada à célula), raio como um quadrado com aquele arredondamento.
 * Valor negativo (margem negativa, letter-spacing) não tem barra honesta: fica
 * só escrito. A amostra é decorativa.
 */
export function DimensionTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(token, _mode, css) => {
        if (css === null || token.type !== 'dimension' || css.startsWith('-')) return null;
        return isRadiusToken(token) ? (
          <span className="sb-token-radius" aria-hidden style={{ '--sb-token-radius': css } as CSSProperties} />
        ) : (
          <span className="sb-token-size" aria-hidden style={{ '--sb-token-size': css } as CSSProperties} />
        );
      }}
    />
  );
}
