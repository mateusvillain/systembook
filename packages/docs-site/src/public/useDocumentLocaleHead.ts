import { useEffect } from 'react';
import { useHref } from 'react-router-dom';
import type { PublishedPage } from '@systembook/schema';
import { hreflangLinks, localizedSitePath } from '@systembook/content/site';
import { useDocsLocale } from '../content/dataSource.js';
import { useDocsPaths } from './docsRoutes.js';

/**
 * Metadados de idioma no `<head>` da doc pública (SYS-186). Os slugs
 * traduzidos existem por SEO, e sem `hreflang`/`canonical` os buscadores
 * tratariam as traduções como conteúdo duplicado. O build estático escreve as
 * mesmas tags no HTML de cada rota; ao navegar sem recarregar, estes hooks as
 * trocam pelas da rota nova.
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

/** As tags de idioma que estes hooks controlam — inclusive as que vieram no HTML do build. */
const MANAGED = 'link[rel="canonical"], link[rel="alternate"][hreflang]';

interface HeadLink {
  rel: 'canonical' | 'alternate';
  href: string;
  hreflang?: string;
}

/**
 * Links de idioma de uma página: um `alternate` por idioma publicado mais o
 * `x-default` (nada com um idioma só, regra de `hreflangLinks`) e, numa página
 * de fallback, o `canonical` para a URL original — a do padrão. URLs
 * absolutas, como o `hreflang` pede. Fora de uma página (home, Tokens, 404),
 * nenhuma.
 */
export function usePageLocaleHead(page: PublishedPage | null | undefined): void {
  const { locale, defaultLocale } = useDocsLocale();
  const { root } = useDocsPaths();
  // A base do router sem a barra final (`/meu-repo` ou `''`).
  const base = useHref('/').replace(/\/+$/, '');

  const links: HeadLink[] = [];
  if (page && locale && defaultLocale) {
    const absolute = (path: string) => new URL(`${base}${root}${path}`, window.location.origin).href;
    for (const { hreflang, path } of hreflangLinks(page.alternates, defaultLocale)) {
      links.push({ rel: 'alternate', hreflang, href: absolute(path) });
    }
    const original = page.alternates[page.locale];
    if (page.locale !== locale && original) {
      links.push({ rel: 'canonical', href: absolute(localizedSitePath(page.locale, original, defaultLocale)) });
    }
  }
  const key = JSON.stringify(links);

  useEffect(() => {
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
