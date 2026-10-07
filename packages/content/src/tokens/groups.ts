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

/** Uma seção da página Tokens: o caminho do grupo e os tokens dele, na ordem do conjunto. */
export interface TokenSection {
  /** `""` quando os tokens estão na raiz, sem grupo. */
  group: string;
  tokens: Token[];
}

/**
 * As seções da página Tokens gerada (SYS-140). O prefixo que todo token
 * compartilha (o namespace, `acme`) não separa nada e fica no nome de todas;
 * abaixo dele, um nível: `acme.palette`, `acme.space`… Os tokens que moram
 * direto no prefixo (`acme.primary`) formam a seção do próprio prefixo. Na
 * ordem em que o primeiro token de cada seção aparece.
 */
export function tokenSections(tokens: readonly Token[]): TokenSection[] {
  const paths = tokens.map((token) => token.path.split('.'));
  // Prefixo comum dos grupos (sem o último segmento de cada caminho).
  let common = paths[0]?.slice(0, -1) ?? [];
  for (const segments of paths) {
    let i = 0;
    while (i < common.length && i < segments.length - 1 && common[i] === segments[i]) i++;
    common = common.slice(0, i);
  }
  const sections = new Map<string, Token[]>();
  tokens.forEach((token, i) => {
    const segments = paths[i]!;
    const group = segments.slice(0, segments.length > common.length + 1 ? common.length + 1 : common.length).join('.');
    const section = sections.get(group);
    if (section) section.push(token);
    else sections.set(group, [token]);
  });
  return [...sections].map(([group, sectionTokens]) => ({ group, tokens: sectionTokens }));
}
