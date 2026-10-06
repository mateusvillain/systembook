import type { CSSProperties } from 'react';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/**
 * Tokens de cor (SYS-133): a tabela de tokens com um swatch por modo, lado a
 * lado. O swatch fica sobre um xadrez, para a transparência aparecer; é
 * decorativo — o valor vem escrito ao lado. Cor sem conversão para CSS (espaço
 * desconhecido, sem `hex`) fica sem swatch: um quadrado vazio leria como
 * "transparente".
 */
export function ColorTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(_token, _mode, css) =>
        css === null ? null : (
          <span className="sb-token-swatch" aria-hidden style={{ '--sb-token-color': css } as CSSProperties} />
        )
      }
    />
  );
}
