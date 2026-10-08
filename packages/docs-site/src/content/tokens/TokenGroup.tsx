import type { ComponentType } from 'react';
import type { Token, TokenType } from '@systembook/schema';
import { ColorTokens } from './ColorTokens.js';
import { DimensionTokens } from './DimensionTokens.js';
import { FontTokens } from './FontTokens.js';
import { NumberTokens } from './NumberTokens.js';
import { ShadowTokens } from './ShadowTokens.js';
import { TokenTable, type TokenTableProps } from './TokenTable.js';
import { TypographySpecimens } from './TypographySpecimens.js';

type Renderer = ComponentType<Omit<TokenTableProps, 'preview'>>;

/** O renderer de cada tipo com amostra própria; o resto cai na tabela de fallback (SYS-136). */
const RENDERERS: Partial<Record<TokenType, Renderer>> = {
  color: ColorTokens,
  typography: TypographySpecimens,
  fontFamily: FontTokens,
  fontWeight: FontTokens,
  dimension: DimensionTokens,
  shadow: ShadowTokens,
  number: NumberTokens,
};

export interface TokenGroupProps {
  tokens: readonly Token[];
  modes: readonly string[];
  /** Nome do grupo, para o nome acessível de cada tabela. */
  label: string;
}

/**
 * Tokens de qualquer tipo com o renderer certo (SYS-139): um bloco por
 * renderer, na ordem em que o primeiro token de cada um aparece. Família e
 * peso dividem uma tabela; a tipografia composta tem specimens próprios
 * (SYS-149); o que não tem renderer próprio vai junto para o fallback.
 */
export function TokenGroup({ tokens, modes, label }: TokenGroupProps) {
  const tables = new Map<Renderer, Token[]>();
  for (const token of tokens) {
    const renderer = RENDERERS[token.type] ?? TokenTable;
    const rows = tables.get(renderer);
    if (rows) rows.push(token);
    else tables.set(renderer, [token]);
  }
  const single = tables.size === 1;
  return (
    <>
      {[...tables].map(([Renderer, rows]) => (
        <Renderer
          key={rows[0]!.path}
          tokens={rows}
          modes={modes}
          label={single ? label : `${label} (${[...new Set(rows.map((t) => t.type))].join(', ')})`}
        />
      ))}
    </>
  );
}
