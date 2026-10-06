import type { CSSProperties } from 'react';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/**
 * Tokens de sombra (SYS-135): um cartão com a sombra aplicada por modo —
 * camadas e `inset` inclusive, já que é o `box-shadow` do próprio valor. A
 * amostra é decorativa; as camadas vêm escritas ao lado.
 */
export function ShadowTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(token, _mode, css) =>
        css === null || token.type !== 'shadow' ? null : (
          <span className="sb-token-shadow" aria-hidden style={{ '--sb-token-shadow': css } as CSSProperties} />
        )
      }
    />
  );
}
