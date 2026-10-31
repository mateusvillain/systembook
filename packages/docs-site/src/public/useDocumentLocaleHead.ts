import { useEffect } from 'react';
import { useHref } from 'react-router-dom';
import type { PublishedPage } from '@systembook/schema';
import { localeHeadLinks, type LocaleHeadLink } from '@systembook/content/site';
import { useDocsLocale } from '../content/dataSource.js';
import { useDocsPaths } from './docsRoutes.js';

/**
 * Metadados de idioma no `<head>` da doc pública (SYS-186). Os slugs
 * traduzidos existem por SEO, e sem `hreflang`/`canonical` os buscadores
 * tratariam as traduções como conteúdo duplicado. O HTML de cada rota do build
 * estático vai trazer as mesmas tags (SYS-187, pela mesma `localeHeadLinks`);
 * ao navegar sem recarregar, estes hooks as trocam pelas da rota nova.
 */

/**
 * `<html lang>` = idioma da rota, o da interface e do conteúdo traduzido. Numa
 * página de fallback o conteúdo leva o próprio `lang` (SYS-185), então a
 * página continua no idioma da rota. Restaura o anterior ao sair da doc (no
 * admin, o painel tem o seu).
 */
export function useDocumentLang(): void {
  const { locale } = useDocsLocale();
  useEffect(() => {
    if (!locale) return;
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = locale;
    return () => {
      root.lang = previous;
    };
  }, [locale]);
}

/** As tags de idioma que estes hooks controlam — inclusive as que vierem no HTML do build. */
const MANAGED = 'link[rel="canonical"], link[rel="alternate"][hreflang]';

interface HeadLink {
  rel: LocaleHeadLink['rel'];
  href: string;
  hreflang?: string;
}

/**
 * Tags de idioma de uma rota de página — a regra é `localeHeadLinks`, a mesma
 * do HTML do build: `hreflang` por idioma publicado mais `x-default` (nada com
 * um idioma só, nem numa tab) e, numa página de fallback, só o `canonical`
 * para a URL original. URLs absolutas, como o `hreflang` pede.
 *
 * `page` `undefined` (carregando) não mexe no head — as tags que vieram no
 * HTML ficam até a página resolver; `null` (404) e fora de uma página (home,
 * Tokens) não há tag nenhuma.
 */
export function usePageLocaleHead(page: PublishedPage | null | undefined, tabSlug?: string | null): void {
  const { locale, defaultLocale } = useDocsLocale();
  const { root } = useDocsPaths();
  // A base do router sem a barra final (`/meu-repo` ou `''`).
  const base = useHref('/').replace(/\/+$/, '');

  let key: string | null = null;
  if (page !== undefined) {
    const links: HeadLink[] =
      page && locale && defaultLocale
        ? localeHeadLinks({
            alternates: page.alternates,
            servedLocale: page.locale,
            routeLocale: locale,
            defaultLocale,
            tabSlug,
          }).map(({ rel, hreflang, path }) => ({
            rel,
            hreflang,
            href: new URL(`${base}${root}${path}`, window.location.origin).href,
          }))
        : [];
    key = JSON.stringify(links);
  }

  useEffect(() => {
    if (key === null) return;
    // Por valor (`key`): um refetch com as mesmas URLs não mexe no head.
    const wanted = JSON.parse(key) as HeadLink[];
    for (const el of document.head.querySelectorAll(MANAGED)) el.remove();
    const added = wanted.map(({ rel, href, hreflang }) => {
      const el = document.createElement('link');
      el.rel = rel;
      if (hreflang) el.hreflang = hreflang;
      el.href = href;
      return document.head.appendChild(el);
    });
    return () => {
      for (const el of added) el.remove();
    };
  }, [key]);
}
