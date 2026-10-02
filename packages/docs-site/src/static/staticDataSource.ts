import type {
  DocsDataSource,
  PageSnapshot,
  PublicComponentPreview,
  PublicNavTree,
  PublicPageRef,
  PublicSettings,
  PublishedPage,
} from '@systembook/schema';
import { parsePageKey, previewKey, staticDataPaths } from '@systembook/content/site';

/**
 * Fonte de dados da doc pública no modo estático (SYS-98): lê os JSONs que o
 * `systembook build` gera (`siteDataFiles`, em `@systembook/content`), sem
 * servidor. Nav, settings e previews são lidos uma vez; cada página, só quando
 * pedida.
 *
 * Uma página só é buscada se existir na nav. Além de poupar a rede, é o que
 * torna a fonte segura em hosts com fallback de SPA, que respondem 200 com o
 * `index.html` para qualquer arquivo inexistente — um 404 não é confiável.
 */
export interface StaticDataSourceOptions {
  /** URL da pasta de dados, com a base (ex.: `/meu-repo/_systembook/data/`). */
  dataUrl: string;
  /** `fetch` a usar; padrão, o global. */
  fetch?: typeof fetch;
}

export function createStaticDataSource({ dataUrl, fetch: doFetch = globalThis.fetch }: StaticDataSourceOptions): DocsDataSource {
  const dir = dataUrl.endsWith('/') ? dataUrl : `${dataUrl}/`;

  async function readJson<T>(path: string): Promise<T> {
    const url = `${dir}${path}`;
    const response = await doFetch(url);
    if (!response.ok) throw new Error(`systembook: falha ao ler ${url} (HTTP ${response.status})`);
    return (await response.json()) as T;
  }

  /** Lê `path` uma vez e reaproveita a promessa; uma falha libera nova tentativa. */
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
    getPageById: async (pageId) => (await getPage(parsePageKey(pageId)))?.snapshot ?? null,
    // O modo estático nasce com as URLs canônicas: não há path legado a resolver.
    resolvePath: async () => null,
    // Busca client-side: SYS-101.
    search: async () => [],
    getComponentPreview: async (ref) =>
      (await once<Record<string, PublicComponentPreview>>(staticDataPaths.previews))[previewKey(ref)] ?? null,
  };
}
