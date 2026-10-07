import type { Token } from '@systembook/schema';

/**
 * Tokens de um grupo (SYS-139): o caminho do grupo e tudo abaixo dele, por
 * segmento inteiro — `color.brand` pega `color.brand` e `color.brand.hover`,
 * não `color.brandish`. Grupo vazio são todos os tokens (bloco `token-table`
 * sem `group`).
 */
export function tokensInGroup(tokens: readonly Token[], group: string): Token[] {
  if (!group) return [...tokens];
  const prefix = `${group}.`;
  return tokens.filter((token) => token.path === group || token.path.startsWith(prefix));
}
