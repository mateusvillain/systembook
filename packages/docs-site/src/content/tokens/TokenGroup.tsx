import type { ComponentType } from 'react';
import type { Token, TokenType } from '@systembook/schema';
import { ColorTokens } from './ColorTokens.js';
import { DimensionTokens } from './DimensionTokens.js';
import { ShadowTokens } from './ShadowTokens.js';
import { TokenTable, type TokenTableProps } from './TokenTable.js';
import { TypographyTokens } from './TypographyTokens.js';

type Renderer = ComponentType<Omit<TokenTableProps, 'preview'>>;

/** O renderer de cada tipo com amostra própria; o resto cai na tabela de fallback (SYS-136). */
const RENDERERS: Partial<Record<TokenType, Renderer>> = {
  color: ColorTokens,
  typography: TypographyTokens,
  fontFamily: TypographyTokens,
  fontWeight: TypographyTokens,
  dimension: DimensionTokens,
  shadow: ShadowTokens,
};

export interface TokenGroupProps {
  tokens: readonly Token[];
  modes: readonly string[];
  /** Nome do grupo, para o nome acessível de cada tabela. */
  label: string;
}

/**
 * Tokens de qualquer tipo com o renderer certo (SYS-139): uma tabela por
 * renderer, na ordem em que o primeiro token de cada um aparece. A tipografia
 * (`typography`, `fontFamily`, `fontWeight`) divide uma tabela, como no
 * renderer; o que não tem renderer próprio vai junto para o fallback.
 */
export function TokenGroup({ tokens, modes, label }: TokenGroupProps) {
  const tables = new Map<Renderer, Token[]>();
  for (const token of tokens) {
    const renderer = RENDERERS[token.type] ?? TokenTable;
    tables.set(renderer, [...(tables.get(renderer) ?? []), token]);
  }
  const single = tables.size === 1;
  return (
    <>
      {[...tables].map(([Renderer, group]) => (
        <Renderer
          key={group[0]!.path}
          tokens={group}
          modes={modes}
          label={single ? label : `${label} (${[...new Set(group.map((t) => t.type))].join(', ')})`}
        />
      ))}
    </>
  );
}
