/**
 * Dicionário de interface (SYS-161): núcleo sem React, reaproveitado pelo
 * provider da doc pública e pelo admin, que traz um dicionário próprio.
 *
 * Uma mensagem é um texto com variáveis `{nome}` ou, quando depende de uma
 * quantidade, um objeto por categoria de plural do `Intl.PluralRules`
 * (`other` obrigatório). A quantidade vem na variável `count`.
 */
export type PluralMessage = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type MessageValue = string | PluralMessage;
export type MessageVars = Record<string, string | number>;

/** Função de tradução de um dicionário, já presa a um locale. */
export type Translator<K extends string> = (key: K, vars?: MessageVars) => string;

const VARIABLE = /\{(\w+)\}/g;

function interpolate(text: string, vars: MessageVars | undefined): string {
  if (!vars) return text;
  return text.replace(VARIABLE, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/**
 * Tradutor de `messages` em `locale`. Chave ausente devolve a própria chave
 * (o tipo já impede, mas um dicionário montado em runtime pode escapar); uma
 * mensagem de plural sem `count` usa `other`.
 */
export function createTranslator<K extends string>(
  messages: Record<K, MessageValue>,
  locale: string,
): Translator<K> {
  const plural = new Intl.PluralRules(locale);
  return (key, vars) => {
    const message = messages[key] as MessageValue | undefined;
    if (message === undefined) return key;
    if (typeof message === 'string') return interpolate(message, vars);
    const count = vars?.count;
    const category = typeof count === 'number' ? plural.select(count) : 'other';
    return interpolate(message[category] ?? message.other, vars);
  };
}

/**
 * Melhor locale disponível para `requested`: o próprio (sem diferenciar
 * caixa), senão o primeiro disponível com o mesmo idioma base (`pt-PT` →
 * `pt-BR`), senão `fallback`.
 */
export function resolveLocale<L extends string>(
  requested: string | null | undefined,
  available: readonly L[],
  fallback: L,
): L {
  if (!requested) return fallback;
  const wanted = requested.toLowerCase();
  const exact = available.find((locale) => locale.toLowerCase() === wanted);
  if (exact) return exact;
  const base = wanted.split('-')[0];
  return available.find((locale) => locale.toLowerCase().split('-')[0] === base) ?? fallback;
}
