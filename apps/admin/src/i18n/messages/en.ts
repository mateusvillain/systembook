import type { MessageValue, PluralMessage } from '@systembook/docs-site';

/**
 * Dicionário de referência do admin (SYS-175): as chaves daqui são as que todo
 * outro idioma precisa ter, na mesma forma — texto onde aqui é texto, plural
 * onde aqui é plural (o typecheck quebra se faltar uma ou se a forma mudar).
 * Prefixo da chave = área do painel.
 */
export const en = {
  // Datas
  'dates.justNow': 'just now',

  // Idioma da interface (menu do usuário)
  'language.label': 'Language',
  'language.automatic': 'Automatic (browser)',
  'language.saveFailed': 'Could not save the language.',
} satisfies Record<string, MessageValue>;

export type AdminMessageKey = keyof typeof en;
export type AdminMessages = {
  [K in AdminMessageKey]: (typeof en)[K] extends string ? string : PluralMessage;
};
