import { createContext, useContext, type ReactNode } from 'react';
import type { DocsDataSource, PublicPageRef } from '@systembook/schema';

/**
 * Injeção da fonte de dados da doc pública (SYS-87). Os componentes públicos
 * leem tudo por `useDocsDataSource()` em vez de chamar o tRPC direto — é o que
 * permite o mesmo site rodar sobre o servidor (modo CMS) ou sobre JSONs
 * estáticos (modo estático). O contrato vive em `@systembook/schema`.
 */
const DocsDataSourceContext = createContext<DocsDataSource | null>(null);

export function DocsDataSourceProvider({
  dataSource,
  children,
}: {
  dataSource: DocsDataSource;
  children: ReactNode;
}) {
  return (
    <DocsDataSourceContext.Provider value={dataSource}>{children}</DocsDataSourceContext.Provider>
  );
}

export function useDocsDataSource(): DocsDataSource {
  const dataSource = useContext(DocsDataSourceContext);
  if (!dataSource) {
    throw new Error('useDocsDataSource precisa de um <DocsDataSourceProvider> acima na árvore.');
  }
  return dataSource;
}

/**
 * Chaves de cache (TanStack Query) das leituras da doc pública. Ficam num
 * namespace próprio, independente da fonte: quem altera dado público no admin
 * (ex.: o logo) invalida por aqui, sem saber qual fonte está montada.
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
