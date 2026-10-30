import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslator, resolveLocale, type Translator } from './format.js';
import { en, type DocsMessageKey, type DocsMessages } from './messages/en.js';
import { ptBR } from './messages/pt-BR.js';

/**
 * Idioma da interface fixa da doc pública (SYS-161): textos como "On this
 * page" e o placeholder da busca. Sem `UiLocaleProvider` na árvore, tudo sai
 * em inglês, como antes do dicionário existir.
 */
const DICTIONARIES = { en, 'pt-BR': ptBR } satisfies Record<string, DocsMessages>;

export type UiLocale = keyof typeof DICTIONARIES;
export const UI_LOCALES = Object.keys(DICTIONARIES) as UiLocale[];
export const DEFAULT_UI_LOCALE: UiLocale = 'en';

/** Dicionário embutido mais próximo de `locale` (BCP 47); `en` quando nenhum serve. */
export function resolveUiLocale(locale: string | null | undefined): UiLocale {
  return resolveLocale(locale, UI_LOCALES, DEFAULT_UI_LOCALE);
}

interface UiLocaleValue {
  locale: UiLocale;
  t: Translator<DocsMessageKey>;
}

function uiLocaleValue(locale: UiLocale): UiLocaleValue {
  return { locale, t: createTranslator(DICTIONARIES[locale], locale) };
}

const UiLocaleContext = createContext<UiLocaleValue>(uiLocaleValue(DEFAULT_UI_LOCALE));

export function UiLocaleProvider({ locale, children }: { locale: string | null | undefined; children: ReactNode }) {
  const resolved = resolveUiLocale(locale);
  const value = useMemo(() => uiLocaleValue(resolved), [resolved]);
  return <UiLocaleContext.Provider value={value}>{children}</UiLocaleContext.Provider>;
}

/** Tradutor da interface no idioma do `UiLocaleProvider` mais próximo. */
export function useMessages(): Translator<DocsMessageKey> {
  return useContext(UiLocaleContext).t;
}

/** Idioma de interface efetivo (já resolvido para um dicionário embutido). */
export function useUiLocale(): UiLocale {
  return useContext(UiLocaleContext).locale;
}
