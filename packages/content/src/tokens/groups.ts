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

/**
 * Os grupos que o bloco `token-table` pode mostrar (SYS-138): todo caminho
 * acima de um token (`acme`, `acme.palette`, `acme.palette.indigo`), na ordem
 * em que o primeiro token de cada um aparece. O caminho de um token não é
 * grupo — a não ser que outro token more abaixo dele.
 */
export function tokenGroups(tokens: readonly Token[]): string[] {
  const groups = new Set<string>();
  for (const token of tokens) {
    const segments = token.path.split('.');
    for (let i = 1; i < segments.length; i++) groups.add(segments.slice(0, i).join('.'));
  }
  return [...groups];
}
