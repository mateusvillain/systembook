import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DocsDataSource, DocsDataSourceFactory, LocaleCode, LocaleInfo } from '@systembook/schema';

/**
 * Injeção da fonte de dados da doc pública (SYS-87). Os componentes públicos
 * leem tudo por `useDocsDataSource()` em vez de chamar o tRPC direto — é o que
 * permite o mesmo site rodar sobre o servidor (modo CMS) ou sobre JSONs
 * estáticos (modo estático). O contrato vive em `@systembook/schema`.
 *
 * A fonte é por idioma (SYS-176): o provider recebe uma fonte única (um idioma
 * só) ou uma `DocsDataSourceFactory`, e `useDocsDataSource()` devolve a do
 * idioma da rota (`DocsLocaleProvider`). Uma fonte por código, criada uma vez
 * — por isso a fábrica precisa ser estável (definida fora do render): uma nova
 * a cada render descarta as fontes e o cache de leitura delas.
 */
type SourceForLocale = (locale: LocaleCode | null) => DocsDataSource;

const DocsDataSourceContext = createContext<SourceForLocale | null>(null);

export function DocsDataSourceProvider({
  dataSource,
  children,
}: {
  dataSource: DocsDataSource | DocsDataSourceFactory;
  children: ReactNode;
}) {
  const sourceFor = useMemo<SourceForLocale>(() => {
    if (typeof dataSource !== 'function') return () => dataSource;
    const sources = new Map<LocaleCode | null, DocsDataSource>();
    return (locale) => {
      let source = sources.get(locale);
      if (!source) {
        source = dataSource(locale);
        sources.set(locale, source);
      }
      return source;
    };
  }, [dataSource]);
  return <DocsDataSourceContext.Provider value={sourceFor}>{children}</DocsDataSourceContext.Provider>;
}

/** Idioma da rota da doc pública e os idiomas publicados (SYS-176). */
export interface DocsLocale {
  /** Código servido pela rota; `null` fora das rotas da doc ou sem settings. */
  locale: LocaleCode | null;
  /** Código do padrão (sem prefixo na URL); `null` como acima. */
  defaultLocale: LocaleCode | null;
  /** Idiomas publicados, o padrão primeiro; vazio como acima. */
  locales: LocaleInfo[];
}

const DocsLocaleContext = createContext<DocsLocale>({ locale: null, defaultLocale: null, locales: [] });

export function DocsLocaleProvider({ value, children }: { value: DocsLocale; children: ReactNode }) {
  return <DocsLocaleContext.Provider value={value}>{children}</DocsLocaleContext.Provider>;
}

/**
 * Idioma da rota. Fora das rotas da doc (`/p/:pageId`, testes de componente),
 * `locale` é `null` e a fonte é a do padrão.
 */
export function useDocsLocale(): DocsLocale {
  return useContext(DocsLocaleContext);
}

function useSourceFor(): SourceForLocale {
  const sourceFor = useContext(DocsDataSourceContext);
  if (!sourceFor) {
    throw new Error('useDocsDataSource precisa de um <DocsDataSourceProvider> acima na árvore.');
  }
  return sourceFor;
}

/**
 * Chave da fonte do idioma da rota: `null` no padrão, que é a mesma fonte de
 * `useDefaultDocsDataSource` (`null` e `defaultLocale` são a mesma fonte), e
 * o código nos demais. As query keys usam a mesma chave.
 */
export function useDocsSourceLocale(): LocaleCode | null {
  const { locale, defaultLocale } = useDocsLocale();
  return locale === defaultLocale ? null : locale;
}

/** Fonte do idioma da rota. */
export function useDocsDataSource(): DocsDataSource {
  const sourceFor = useSourceFor();
  return sourceFor(useDocsSourceLocale());
}

/**
 * Fonte do idioma padrão, para o que não depende do idioma (as settings: nome,
 * logos e a própria lista de idiomas, lida antes de resolver a rota).
 */
export function useDefaultDocsDataSource(): DocsDataSource {
  return useSourceFor()(null);
}
