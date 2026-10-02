import { useQuery } from '@tanstack/react-query';
import type { ComponentPreviewRef, PublicPageRef } from '@systembook/schema';
import { useDocsDataSource } from './dataSource.js';

/**
 * Chaves de cache (TanStack Query) das leituras da doc pública (SYS-88). Ficam
 * num namespace próprio, independente da fonte montada: quem altera dado
 * público no admin (ex.: o logo, em `BrandSettings`) invalida por aqui.
 */
export const docsQueryKeys = {
  all: ['systembook-docs'] as const,
  navTree: () => [...docsQueryKeys.all, 'navTree'] as const,
  settings: () => [...docsQueryKeys.all, 'settings'] as const,
  landing: () => [...docsQueryKeys.all, 'landing'] as const,
  pageBySlug: (ref: PublicPageRef) => [...docsQueryKeys.all, 'pageBySlug', ref] as const,
  pageById: (pageId: string) => [...docsQueryKeys.all, 'pageById', pageId] as const,
  resolvePath: (segments: string[]) => [...docsQueryKeys.all, 'resolvePath', segments] as const,
  search: (q: string) => [...docsQueryKeys.all, 'search', q] as const,
  componentPreview: (ref: ComponentPreviewRef) =>
    [...docsQueryKeys.all, 'componentPreview', ref] as const,
};

// Uma query por leitura do `DocsDataSource`. Os componentes públicos usam
// estes hooks; nenhum deles conhece a fonte por trás. Parâmetros vindos da URL
// chegam opcionais, e a query só dispara quando estão todos presentes.

export function useNavTree() {
  const ds = useDocsDataSource();
  return useQuery({ queryKey: docsQueryKeys.navTree(), queryFn: () => ds.getNavTree() });
}

export function usePublicSettings() {
  const ds = useDocsDataSource();
  return useQuery({ queryKey: docsQueryKeys.settings(), queryFn: () => ds.getSettings() });
}

export function useLanding() {
  const ds = useDocsDataSource();
  return useQuery({ queryKey: docsQueryKeys.landing(), queryFn: () => ds.getLanding() });
}

export function usePageBySlug({ menuSlug, sectionSlug, pageSlug }: Partial<PublicPageRef>) {
  const ds = useDocsDataSource();
  const ref = { menuSlug: menuSlug ?? '', sectionSlug: sectionSlug ?? '', pageSlug: pageSlug ?? '' };
  return useQuery({
    queryKey: docsQueryKeys.pageBySlug(ref),
    queryFn: () => ds.getPageBySlug(ref),
    enabled: !!menuSlug && !!sectionSlug && !!pageSlug,
  });
}

export function usePageById(pageId: string | undefined) {
  const ds = useDocsDataSource();
  return useQuery({
    queryKey: docsQueryKeys.pageById(pageId ?? ''),
    queryFn: () => ds.getPageById(pageId!),
    enabled: !!pageId,
  });
}

/** Quantidade de segmentos fora do aceito vira `null` na própria fonte (contrato). */
export function useResolvedPath(segments: string[]) {
  const ds = useDocsDataSource();
  return useQuery({
    queryKey: docsQueryKeys.resolvePath(segments),
    queryFn: () => ds.resolvePath(segments),
  });
}

export function usePublicSearch(q: string) {
  const ds = useDocsDataSource();
  return useQuery({
    queryKey: docsQueryKeys.search(q),
    queryFn: () => ds.search(q),
    enabled: q.length > 0,
  });
}

/** Um embed (ou cover) só tem preview a resolver com componente **e** variante escolhidos. */
export function hasPreviewSelection(componentName: string, variantId: string | null): boolean {
  return componentName.length > 0 && !!variantId;
}

/** Preview de uma variante; só dispara com componente e variante escolhidos. */
export function useComponentPreview(componentName: string, variantId: string | null) {
  const ds = useDocsDataSource();
  const ref = { componentName, variantId: variantId ?? '' };
  return useQuery({
    queryKey: docsQueryKeys.componentPreview(ref),
    queryFn: () => ds.getComponentPreview(ref),
    enabled: hasPreviewSelection(componentName, variantId),
  });
}
