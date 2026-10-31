import { useQuery } from '@tanstack/react-query';
import type { ComponentPreviewRef, LocaleCode, PublicPageRef } from '@systembook/schema';
import { useDefaultDocsDataSource, useDocsDataSource, useDocsSourceLocale } from './dataSource.js';

/**
 * Chaves de cache (TanStack Query) das leituras da doc pública (SYS-88). Ficam
 * num namespace próprio, independente da fonte montada: quem altera dado
 * público no admin (ex.: o logo, em `BrandSettings`) invalida por aqui.
 *
 * Cada leitura leva o idioma da fonte (SYS-176) logo depois do nome, então
 * `[...all, 'navTree']` invalida a nav de todos os idiomas. `null` é o padrão,
 * dentro ou fora das rotas da doc (`useDocsSourceLocale`). As settings não
 * dependem do idioma e são lidas sempre da fonte padrão.
 */
type QueryLocale = LocaleCode | null;

export const docsQueryKeys = {
  all: ['systembook-docs'] as const,
  navTree: (locale: QueryLocale) => [...docsQueryKeys.all, 'navTree', locale] as const,
  settings: () => [...docsQueryKeys.all, 'settings'] as const,
  landing: (locale: QueryLocale) => [...docsQueryKeys.all, 'landing', locale] as const,
  pageBySlug: (locale: QueryLocale, ref: PublicPageRef) => [...docsQueryKeys.all, 'pageBySlug', locale, ref] as const,
  pageById: (locale: QueryLocale, pageId: string) => [...docsQueryKeys.all, 'pageById', locale, pageId] as const,
  resolvePath: (locale: QueryLocale, segments: string[]) =>
    [...docsQueryKeys.all, 'resolvePath', locale, segments] as const,
  search: (locale: QueryLocale, q: string) => [...docsQueryKeys.all, 'search', locale, q] as const,
  componentPreview: (locale: QueryLocale, ref: ComponentPreviewRef) =>
    [...docsQueryKeys.all, 'componentPreview', locale, ref] as const,
  tokens: (locale: QueryLocale) => [...docsQueryKeys.all, 'tokens', locale] as const,
};

/** A fonte do idioma da rota e a chave de idioma das queries dela. */
function useLocalizedSource() {
  return { ds: useDocsDataSource(), locale: useDocsSourceLocale() };
}

// Uma query por leitura do `DocsDataSource`. Os componentes públicos usam
// estes hooks; nenhum deles conhece a fonte por trás. Parâmetros vindos da URL
// chegam opcionais, e a query só dispara quando estão todos presentes.

export function useNavTree() {
  const { ds, locale } = useLocalizedSource();
  return useQuery({ queryKey: docsQueryKeys.navTree(locale), queryFn: () => ds.getNavTree() });
}

export function usePublicSettings() {
  const ds = useDefaultDocsDataSource();
  return useQuery({ queryKey: docsQueryKeys.settings(), queryFn: () => ds.getSettings() });
}

export function useLanding() {
  const { ds, locale } = useLocalizedSource();
  return useQuery({ queryKey: docsQueryKeys.landing(locale), queryFn: () => ds.getLanding() });
}

export function usePageBySlug({ menuSlug, sectionSlug, pageSlug }: Partial<PublicPageRef>) {
  const { ds, locale } = useLocalizedSource();
  const ref = { menuSlug: menuSlug ?? '', sectionSlug: sectionSlug ?? '', pageSlug: pageSlug ?? '' };
  return useQuery({
    queryKey: docsQueryKeys.pageBySlug(locale, ref),
    queryFn: () => ds.getPageBySlug(ref),
    enabled: !!menuSlug && !!sectionSlug && !!pageSlug,
  });
}

export function usePageById(pageId: string | undefined) {
  const { ds, locale } = useLocalizedSource();
  return useQuery({
    queryKey: docsQueryKeys.pageById(locale, pageId ?? ''),
    queryFn: () => ds.getPageById(pageId!),
    enabled: !!pageId,
  });
}

/** Quantidade de segmentos fora do aceito vira `null` na própria fonte (contrato). */
export function useResolvedPath(segments: string[]) {
  const { ds, locale } = useLocalizedSource();
  return useQuery({
    queryKey: docsQueryKeys.resolvePath(locale, segments),
    queryFn: () => ds.resolvePath(segments),
  });
}

export function usePublicSearch(q: string) {
  const { ds, locale } = useLocalizedSource();
  return useQuery({
    queryKey: docsQueryKeys.search(locale, q),
    queryFn: () => ds.search(q),
    enabled: q.length > 0,
  });
}

/** Os design tokens; `null` sem nenhum (contrato do `getTokens`). */
export function useTokens() {
  const { ds, locale } = useLocalizedSource();
  return useQuery({ queryKey: docsQueryKeys.tokens(locale), queryFn: () => ds.getTokens() });
}

/** Um embed (ou cover) só tem preview a resolver com componente **e** variante escolhidos. */
export function hasPreviewSelection(componentName: string, variantId: string | null): boolean {
  return componentName.length > 0 && !!variantId;
}

/** Preview de uma variante; só dispara com componente e variante escolhidos. */
export function useComponentPreview(componentName: string, variantId: string | null) {
  const { ds, locale } = useLocalizedSource();
  const ref = { componentName, variantId: variantId ?? '' };
  return useQuery({
    queryKey: docsQueryKeys.componentPreview(locale, ref),
    queryFn: () => ds.getComponentPreview(ref),
    enabled: hasPreviewSelection(componentName, variantId),
  });
}
