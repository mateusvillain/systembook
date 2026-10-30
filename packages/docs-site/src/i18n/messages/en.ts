import type { MessageValue } from '../format.js';

/**
 * Dicionário de referência da doc pública: as chaves daqui são as que todo
 * outro idioma precisa ter (o typecheck quebra se faltar uma).
 */
export const en = {
  'toc.title': 'On this page',
  'search.placeholder': 'Search the documentation',
  'search.placeholderNamed': 'Search {name}',
} satisfies Record<string, MessageValue>;

export type DocsMessageKey = keyof typeof en;
export type DocsMessages = Record<DocsMessageKey, MessageValue>;
