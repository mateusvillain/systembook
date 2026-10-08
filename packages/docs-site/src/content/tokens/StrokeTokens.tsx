import type { CSSProperties } from 'react';
import type { Token, TokenValue } from '@systembook/schema';
import { toCssValue } from '@systembook/content/tokens';
import { TokenSample } from './TokenSample.js';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/** Traço com `dashArray`: os traços em CSS (`2px`, `0.25rem`) e o acabamento das pontas. */
function dashOf(value: TokenValue): { dasharray: string; linecap?: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !Array.isArray(value.dashArray)) return null;
  const dashes = value.dashArray.map((d) => toCssValue('dimension', d));
  if (!dashes.length || dashes.some((d) => d === null)) return null;
  const linecap = typeof value.lineCap === 'string' ? value.lineCap : undefined;
  return { dasharray: dashes.join(' '), linecap };
}

function StrokeSample({ token, value, css }: { token: Token; value: TokenValue; css: string }) {
  if (token.type === 'border') return <TokenSample kind="border" value={css} />;
  const dash = dashOf(value);
  if (!dash) return <TokenSample kind="stroke" value={css} />;
  return (
    <svg className="sb-token-dash" viewBox="0 0 96 12" preserveAspectRatio="none" aria-hidden>
      <line
        x1={4}
        y1={6}
        x2={92}
        y2={6}
        stroke="currentColor"
        strokeWidth={3}
        style={{ strokeDasharray: dash.dasharray, strokeLinecap: dash.linecap } as CSSProperties}
      />
    </svg>
  );
}

/**
 * Bordas e traços (SYS-152): `border` vira uma caixa com a borda inteira do
 * token, e `strokeStyle` uma linha com o estilo — ou, com `dashArray`, a linha
 * em SVG com aqueles traços e pontas, que o CSS de borda não representa (a
 * conversão para `border-style` vira `dashed`).
 */
export function StrokeTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(token, mode, css) =>
        css === null || (token.type !== 'border' && token.type !== 'strokeStyle') ? null : (
          <StrokeSample token={token} value={token.byMode[mode]!.resolvedValue} css={css} />
        )
      }
    />
  );
}
