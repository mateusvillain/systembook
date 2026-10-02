import type { PublicPageRef } from '@systembook/schema';

/**
 * Onde cada parte de `StaticSiteData` mora, relativo à pasta de dados do site
 * (SYS-96). Produtor (build) e consumidor (`staticDataSource`) usam estas
 * funções — mudar um caminho é mudar aqui.
 */
export const staticDataPaths = {
  settings: 'settings.json',
  nav: 'nav.json',
  landing: 'landing.json',
  page: ({ menuSlug, sectionSlug, pageSlug }: PublicPageRef) =>
    `pages/${menuSlug}/${sectionSlug}/${pageSlug}.json`,
};

/** Chave de `StaticSiteData.pages` para um endereço. */
export function pageKey({ menuSlug, sectionSlug, pageSlug }: PublicPageRef): string {
  return `${menuSlug}/${sectionSlug}/${pageSlug}`;
}
