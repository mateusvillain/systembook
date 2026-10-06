import type { CSSProperties } from 'react';
import { TokenTable, tokenValueText, type TokenTableProps } from './TokenTable.js';

/**
 * Tokens de cor (SYS-133): a tabela de tokens com um swatch por modo, lado a
 * lado. O swatch fica sobre um xadrez, para a transparência aparecer; é
 * decorativo — o valor vem escrito ao lado.
 */
export function ColorTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(token, mode) => (
        <span
          className="sb-token-swatch"
          aria-hidden
          style={{ '--sb-token-color': tokenValueText(token, mode) } as CSSProperties}
        />
      )}
    />
  );
}
