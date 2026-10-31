import type {
  DocsDataSource,
  DocsDataSourceFactory,
  LocaleCode,
  PageSnapshot,
  PublicComponentPreview,
  PublicNavTree,
  PublicPageRef,
  PublicSettings,
  PublishedPage,
  TokenSet,
} from '@systembook/schema';
import {
  loadSearchIndex,
  localeDataDir,
  previewKey,
  querySearchIndex,
  staticDataPaths,
  type SearchIndex,
  type SearchIndexJson,
} from '@systembook/content/site';
import { nonEmptyTokenSet } from '@systembook/content/tokens';

/**
 * Fonte de dados da doc pública no modo estático (SYS-98): lê os JSONs que o
 * `systembook build` gera (`siteDataFiles`, em `@systembook/content`), sem
 * servidor. Nav, settings e previews são lidos uma vez; cada página, só quando
 * pedida; o índice de busca, só na primeira busca (SYS-101).
 *
 * Uma página só é buscada se existir na nav. Além de poupar a rede, é o que
 * torna a fonte segura em hosts com fallback de SPA, que respondem 200 com o
 * `index.html` para qualquer arquivo inexistente — um 404 não é confiável.
 *
 * Com idiomas, `createStaticDataSourceFactory` dá uma fonte por idioma.
 */
export interface StaticDataSourceOptions {
  /**
   * URL da pasta de dados, com a base (ex.: `/meu-repo/_systembook/data/`).
   * Precisa ser absoluta: relativa, resolveria contra a rota atual do SPA.
   */
  dataUrl: string;
  /** `fetch` a usar; padrão, o global. */
  fetch?: typeof fetch;
}

/**
 * Fábrica por idioma (SYS-170): cada idioma lê navegação, landing, páginas e
 * busca da própria pasta (`localeDataDir` — o padrão na raiz, como antes dos
 * idiomas); settings, previews e tokens, iguais em todos, saem da raiz e são
 * lidos uma vez para todos os idiomas. `null` é o padrão sem precisar das
 * settings para achar a pasta. Cada chamada cria uma fonte (quem chama guarda
 * uma por código, como diz o contrato), mas o cache de leituras e dos índices
 * de busca é da fábrica, por caminho: fontes do mesmo idioma não leem nada duas vezes.
 */
export function createStaticDataSourceFactory({
  dataUrl,
  fetch: doFetch = globalThis.fetch,
}: StaticDataSourceOptions): DocsDataSourceFactory {
  if (!/^(\/|[a-z][a-z0-9+.-]*:)/i.test(dataUrl)) {
    throw new Error(`systembook: dataUrl precisa ser absoluta (/… ou https://…), recebido "${dataUrl}".`);
  }
  const dir = dataUrl.endsWith('/') ? dataUrl : `${dataUrl}/`;

  async function readJson<T>(path: string): Promise<T> {
    const url = `${dir}${path}`;
    const response = await doFetch(url);
    if (!response.ok) throw new Error(`systembook: falha ao ler ${url} (HTTP ${response.status})`);
    try {
      return (await response.json()) as T;
    } catch {
      // Host com fallback de SPA responde 200 com HTML para arquivo que não existe.
      throw new Error(`systembook: ${url} não é JSON — o arquivo existe na pasta de dados do site?`);
    }
  }

  /**
   * Lê `path` uma vez e reaproveita a promessa; uma falha libera nova
   * tentativa. Sem limite de tamanho: uma doc tem poucas centenas de páginas.
   * Compartilhado entre os idiomas — os caminhos já levam a pasta do idioma.
   */
  const cache = new Map<string, Promise<unknown>>();
  function once<T>(path: string): Promise<T> {
    let pending = cache.get(path);
    if (!pending) {
      pending = readJson<T>(path).catch((error: unknown) => {
        cache.delete(path);
        throw error;
      });
      cache.set(path, pending);
    }
    return pending as Promise<T>;
  }

  const getSettings = () => once<PublicSettings>(staticDataPaths.settings);

  // Fora do `once`: guardar o JSON cru além do índice carregado seria o dado
  // duas vezes na memória. Por caminho, como o `once`: `null` e o código do
  // padrão leem o mesmo índice uma vez só.
  const indexes = new Map<string, Promise<SearchIndex>>();
  function searchIndex(path: string): Promise<SearchIndex> {
    let pending = indexes.get(path);
    if (!pending) {
      pending = readJson<SearchIndexJson>(path).then(loadSearchIndex, (error: unknown) => {
        indexes.delete(path);
        throw error;
      });
      indexes.set(path, pending);
    }
    return pending;
  }

  /** Pasta do idioma; um código fora de `settings.locales` é erro de quem chama. */
  async function localeDir(locale: LocaleCode | null): Promise<string> {
    if (locale === null) return '';
    const { locales, defaultLocale } = await getSettings();
    if (!locales.some(({ code }) => code === locale)) {
      throw new Error(`systembook: o idioma "${locale}" não está publicado neste site.`);
    }
    return localeDataDir(locale, defaultLocale);
  }

  function createSource(locale: LocaleCode | null): DocsDataSource {
    /**
     * `load` no caminho do idioma. No padrão (`null`), sem passar pelas
     * settings: as mesmas leituras, na mesma ordem, de antes dos idiomas.
     */
    const inLocale = <T>(load: (path: string) => Promise<T>, path: string): Promise<T> =>
      locale === null ? load(path) : localeDir(locale).then((prefix) => load(`${prefix}${path}`));
    const read = <T>(path: string) => inLocale((p) => once<T>(p), path);
    const getNavTree = () => read<PublicNavTree>(staticDataPaths.nav);

    const getSearchIndex = () => inLocale(searchIndex, staticDataPaths.search);

    async function getPage(ref: PublicPageRef): Promise<PublishedPage | null> {
      const nav = await getNavTree();
      const exists = nav
        .find((menu) => menu.slug === ref.menuSlug)
        ?.sections.find((section) => section.slug === ref.sectionSlug)
        ?.pages.some((page) => page.slug === ref.pageSlug);
      return exists ? read<PublishedPage>(staticDataPaths.page(ref)) : null;
    }

    return {
      getNavTree,
      getSettings,
      getLanding: () => read<PageSnapshot | null>(staticDataPaths.landing),
      getPageBySlug: getPage,
      // No modo estático o id da página é o endereço canônico (`menu/seção/página`).
      // A rota `/p/:pageId` é do modo CMS; aqui a leitura existe pelo contrato.
      getPageById: async (pageId) => {
        const [menuSlug, sectionSlug, pageSlug, ...rest] = pageId.split('/');
        if (!menuSlug || !sectionSlug || !pageSlug || rest.length) return null;
        return (await getPage({ menuSlug, sectionSlug, pageSlug }))?.snapshot ?? null;
      },
      // O modo estático nasce com as URLs canônicas: não há path legado a resolver.
      resolvePath: async () => null,
      search: async (q) => querySearchIndex(await getSearchIndex(), q),
      getComponentPreview: async (ref) =>
        (await once<Record<string, PublicComponentPreview>>(staticDataPaths.previews))[previewKey(ref)] ?? null,
      getTokens: async () => nonEmptyTokenSet(await once<TokenSet | null>(staticDataPaths.tokens)),
    };
  }

  return createSource;
}

/** A fonte do idioma padrão — a de um site de idioma único. */
export function createStaticDataSource(options: StaticDataSourceOptions): DocsDataSource {
  return createStaticDataSourceFactory(options)(null);
}
