import type { PublicPageRef } from '@systembook/schema';

/**
 * Onde cada parte de `StaticSiteData` mora, relativo à pasta de dados do site
 * (SYS-96), e a URL de cada página. Produtor (build) e consumidor
 * (`staticDataSource`) usam estas funções — mudar um caminho é mudar aqui.
 */
export const staticDataPaths = {
  settings: 'settings.json',
  nav: 'nav.json',
  landing: 'landing.json',
  page: (ref: PublicPageRef) => `pages/${pageKey(ref)}.json`,
};

/** Chave de `StaticSiteData.pages` para um endereço. */
export function pageKey({ menuSlug, sectionSlug, pageSlug }: PublicPageRef): string {
  return `${menuSlug}/${sectionSlug}/${pageSlug}`;
}

/** Inverso de `pageKey`. */
export function parsePageKey(key: string): PublicPageRef {
  const [menuSlug = '', sectionSlug = '', pageSlug = ''] = key.split('/');
  return { menuSlug, sectionSlug, pageSlug };
}

/** Caminho da página (ou de uma tab dela) no site, sem a base: `/menu/seção/página[/tab]`. */
export function sitePath(ref: PublicPageRef, tabSlug?: string): string {
  return `/${pageKey(ref)}${tabSlug ? `/${tabSlug}` : ''}`;
}
