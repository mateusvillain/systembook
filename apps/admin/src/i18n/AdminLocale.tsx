import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { createTranslator, resolveLocale, UiLocaleProvider, type Translator } from '@systembook/docs-site';
import { useTRPC } from '../lib/trpc.js';
import { en, type AdminMessageKey, type AdminMessages } from './messages/en.js';
import { ptBR } from './messages/pt-BR.js';

/**
 * Idioma da interface do admin (SYS-175), independente do idioma do conteúdo.
 * Usa o núcleo do dicionário do `docs-site` com um dicionário próprio.
 */
const DICTIONARIES = { en, 'pt-BR': ptBR } satisfies Record<string, AdminMessages>;

export type AdminLocale = keyof typeof DICTIONARIES;
export const ADMIN_LOCALES = Object.keys(DICTIONARIES) as AdminLocale[];
export const DEFAULT_ADMIN_LOCALE: AdminLocale = 'en';

/** Nome de cada idioma nele mesmo — quem não lê o idioma atual ainda acha o seu. */
export const ADMIN_LOCALE_NAMES: Record<AdminLocale, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

/** Idioma preferido do navegador (o primeiro de `navigator.languages`). */
function browserLanguage(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.languages?.[0] ?? navigator.language;
}

/** Dicionário para a preferência salva; sem preferência, o do navegador; senão `en`. */
export function resolveAdminLocale(preference: string | null | undefined): AdminLocale {
  return resolveLocale(preference ?? browserLanguage(), ADMIN_LOCALES, DEFAULT_ADMIN_LOCALE);
}

interface AdminLocaleValue {
  locale: AdminLocale;
  t: Translator<AdminMessageKey>;
}

const AdminLocaleContext = createContext<AdminLocaleValue>({
  locale: DEFAULT_ADMIN_LOCALE,
  t: createTranslator(en, DEFAULT_ADMIN_LOCALE),
});

/**
 * Aplica o idioma resolvido de `preference` ao painel: dicionário do admin,
 * dicionário da doc pública (os componentes do `docs-site` renderizados dentro
 * do admin — preview, capa do do's & don'ts) e `<html lang>`.
 */
export function AdminLocaleProvider({
  preference,
  children,
}: {
  preference: string | null | undefined;
  children: ReactNode;
}) {
  const locale = resolveAdminLocale(preference);
  const value = useMemo(() => ({ locale, t: createTranslator(DICTIONARIES[locale], locale) }), [locale]);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = locale;
    return () => {
      root.lang = previous;
    };
  }, [locale]);

  return (
    <AdminLocaleContext.Provider value={value}>
      <UiLocaleProvider locale={locale}>{children}</UiLocaleProvider>
    </AdminLocaleContext.Provider>
  );
}

/**
 * Rota sem caminho que envolve login e painel: a preferência vem do `auth.me`
 * (mesma query do `AdminLayout`); enquanto ele carrega ou sem sessão, vale o
 * navegador. A doc pública (`/docs`) fica de fora — ela tem o próprio idioma.
 */
export function AdminLocaleRoute() {
  const trpc = useTRPC();
  const me = useQuery(trpc.auth.me.queryOptions());
  return (
    <AdminLocaleProvider preference={me.data?.idiomaInterface}>
      <Outlet />
    </AdminLocaleProvider>
  );
}

/** Tradutor do admin no idioma ativo. */
export function useT(): Translator<AdminMessageKey> {
  return useContext(AdminLocaleContext).t;
}

/** Idioma ativo do admin (já resolvido para um dicionário embutido). */
export function useAdminLocale(): AdminLocale {
  return useContext(AdminLocaleContext).locale;
}
