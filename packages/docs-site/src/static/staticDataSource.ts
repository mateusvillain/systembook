import type {
  DocsDataSource,
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

export function createStaticDataSource({ dataUrl, fetch: doFetch = globalThis.fetch }: StaticDataSourceOptions): DocsDataSource {
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

  const getNavTree = () => once<PublicNavTree>(staticDataPaths.nav);

  // Fora do `once`: guardar o JSON cru além do índice carregado seria o
  // dado duas vezes na memória.
  let index: Promise<SearchIndex> | null = null;
  const getSearchIndex = () => {
    index ??= readJson<SearchIndexJson>(staticDataPaths.search).then(loadSearchIndex, (error: unknown) => {
      index = null;
      throw error;
    });
    return index;
  };

  async function getPage(ref: PublicPageRef): Promise<PublishedPage | null> {
    const nav = await getNavTree();
    const exists = nav
      .find((menu) => menu.slug === ref.menuSlug)
      ?.sections.find((section) => section.slug === ref.sectionSlug)
      ?.pages.some((page) => page.slug === ref.pageSlug);
    return exists ? once<PublishedPage>(staticDataPaths.page(ref)) : null;
  }

  return {
    getNavTree,
    getSettings: () => once<PublicSettings>(staticDataPaths.settings),
    getLanding: () => once<PageSnapshot | null>(staticDataPaths.landing),
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
