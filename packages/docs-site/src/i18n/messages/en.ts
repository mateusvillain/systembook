import type { MessageValue, PluralMessage } from '../format.js';

/**
 * Dicionário de referência da doc pública: as chaves daqui são as que todo
 * outro idioma precisa ter, na mesma forma — texto onde aqui é texto, plural
 * onde aqui é plural (o typecheck quebra se faltar uma ou se a forma mudar).
 */
export const en = {
  'toc.title': 'On this page',
  'search.placeholder': 'Search the documentation',
  'search.placeholderNamed': 'Search {name}',
} satisfies Record<string, MessageValue>;

export type DocsMessageKey = keyof typeof en;
export type DocsMessages = {
  [K in DocsMessageKey]: (typeof en)[K] extends string ? string : PluralMessage;
};
