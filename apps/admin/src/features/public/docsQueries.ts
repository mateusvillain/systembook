import { useQuery } from '@tanstack/react-query';
import type { PublicPageRef } from '@systembook/schema';
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
};

// Uma query por leitura do `DocsDataSource`. Os componentes públicos usam
// estes hooks; nenhum deles conhece a fonte por trás.

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

export function usePageBySlug(ref: PublicPageRef, enabled: boolean) {
  const ds = useDocsDataSource();
  return useQuery({
    queryKey: docsQueryKeys.pageBySlug(ref),
    queryFn: () => ds.getPageBySlug(ref),
    enabled,
  });
}

export function usePageById(pageId: string, enabled: boolean) {
  const ds = useDocsDataSource();
  return useQuery({
    queryKey: docsQueryKeys.pageById(pageId),
    queryFn: () => ds.getPageById(pageId),
    enabled,
  });
}

export function useResolvedPath(segments: string[], enabled: boolean) {
  const ds = useDocsDataSource();
  return useQuery({
    queryKey: docsQueryKeys.resolvePath(segments),
    queryFn: () => ds.resolvePath(segments),
    enabled,
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
