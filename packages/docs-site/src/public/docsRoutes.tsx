import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { PublicPageRef } from '@systembook/schema';
import { localePrefix, TOKENS_SEGMENT } from '@systembook/content/site';
import { useDocsLocale } from '../content/dataSource.js';

/**
 * Onde a doc pública mora dentro do router (SYS-91). São duas camadas, e só a
 * segunda é deste módulo:
 *
 * - **base de publicação** (`/meu-repo/` no GitHub Pages de projeto): é o
 *   `basename` do router de quem monta o site. O React Router já o aplica a
 *   todo `Link`/`navigate` e o tira do `pathname` de `useLocation`, então
 *   nada aqui precisa conhecê-lo;
 * - **prefixo das rotas da doc**: `/docs` no modo CMS (o painel ocupa a raiz)
 *   e vazio no modo estático (a doc *é* o site).
 *
 * Quem monta as rotas com `createDocsRoute(prefix)` já recebe o provider com o
 * mesmo prefixo. Sem provider, a doc fica na raiz.
 *
 * Abaixo do prefixo vem o do idioma (SYS-176): nada no padrão, `/pt-br` nos
 * demais. Os caminhos de `useDocsPaths` já o incluem, conforme o idioma da
 * rota (`useDocsLocale`).
 */
const DocsRoutesContext = createContext('');

/** Normaliza o prefixo: começa com `/` e nunca termina com `/` (`''` = raiz). */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

export function DocsRoutesProvider({ prefix, children }: { prefix: string; children: ReactNode }) {
  return (
    <DocsRoutesContext.Provider value={normalizePrefix(prefix)}>{children}</DocsRoutesContext.Provider>
  );
}

export interface DocsPaths {
  /** Raiz das rotas da doc, de qualquer idioma (`/docs`; `''` na raiz). */
  root: string;
  /** Raiz da doc (landing) no idioma da rota. */
  home: string;
  /** Endereço canônico de uma página, opcionalmente numa tab. */
  page(ref: PublicPageRef, tabId?: string | null): string;
  /** Página Tokens gerada (SYS-140). */
  tokens: string;
  /** Endereço sem o menu (forma anterior à SYS-37), que o redirect legado resolve. */
  legacyPage(sectionSlug: string, pageSlug: string): string;
  /**
   * Segmentos do `pathname` (relativo ao `basename`) abaixo da raiz da doc no
   * idioma da rota (sem o prefixo do idioma). Um `pathname` fora do prefixo é
   * devolvido inteiro — não acontece com as rotas de `createDocsRoute`, que só
   * casam dentro dele.
   */
  segments(pathname: string): string[];
}

export function useDocsPaths(): DocsPaths {
  const root = useContext(DocsRoutesContext);
  const { locale, defaultLocale } = useDocsLocale();
  const prefix = `${root}${locale && defaultLocale ? localePrefix(locale, defaultLocale) : ''}`;
  return useMemo(
    () => ({
      root,
      home: prefix || '/',
      page: ({ menuSlug, sectionSlug, pageSlug }, tabId) =>
        `${prefix}/${menuSlug}/${sectionSlug}/${pageSlug}${tabId ? `/${tabId}` : ''}`,
      tokens: `${prefix}/${TOKENS_SEGMENT}`,
      legacyPage: (sectionSlug, pageSlug) => `${prefix}/${sectionSlug}/${pageSlug}`,
      segments: (pathname) => {
        const rest =
          pathname === prefix || pathname.startsWith(`${prefix}/`)
            ? pathname.slice(prefix.length)
            : pathname;
        return rest.split('/').filter(Boolean);
      },
    }),
    [root, prefix],
  );
}
