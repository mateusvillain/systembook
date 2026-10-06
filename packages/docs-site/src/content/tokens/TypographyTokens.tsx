import type { CSSProperties } from 'react';
import type { Token } from '@systembook/schema';
import { typographyProperties } from '@systembook/content/tokens';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/** Texto da amostra: tem ascendentes, descendentes e as letras que mais mudam entre fontes. */
const SAMPLE = 'The quick brown fox jumps over the lazy dog';

/** `font-size` → `fontSize`, para o `style` do React. */
const camel = (property: string) => property.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

/** O estilo que a amostra aplica: a tipografia inteira, ou só a família ou o peso. */
function sampleStyle(token: Token, mode: string, css: string | null): CSSProperties | null {
  if (token.type === 'typography') {
    const properties = Object.entries(typographyProperties(token.byMode[mode]!.resolvedValue));
    return properties.length ? Object.fromEntries(properties.map(([p, v]) => [camel(p), v])) : null;
  }
  if (css === null) return null;
  if (token.type === 'fontFamily') return { fontFamily: css };
  if (token.type === 'fontWeight') return { fontWeight: css };
  return null;
}

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
        const style = sampleStyle(token, mode, css);
        return style ? (
          <span className="sb-token-type-sample" aria-hidden style={style}>
            {SAMPLE}
          </span>
        ) : null;
      }}
    />
  );
}
