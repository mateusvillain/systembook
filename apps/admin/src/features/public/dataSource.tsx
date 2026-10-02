import { createContext, useContext, type ReactNode } from 'react';
import type { DocsDataSource } from '@systembook/schema';

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

