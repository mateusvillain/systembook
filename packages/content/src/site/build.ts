import type {
  Block,
  LocaleCode,
  PageSnapshot,
  PublicComponentPreview,
  PublicNavTree,
  PublicPageRef,
  PublicSettings,
  PublishedPage,
  StaticSiteData,
  StaticSiteDataByLocale,
  TokenSet,
} from '@systembook/schema';
import { tiptapDocToBlocks, type TiptapDoc, type TiptapNode } from '../blocks.js';
import type { Diagnostic } from '../diagnostics.js';
import type { ContentDocument, ContentTree, LocaleTree, PageNode, TabNode } from '../tree/types.js';
import { buildLocaleTree } from '../tree/locale.js';
import { localeDataDir, localizedHomePath, localizedSitePath } from './locale.js';
import { pageKey, parsePageKey, staticDataPaths } from './paths.js';
import { nonEmptyTokenSet } from '../tokens/types.js';
import { createSearchIndex } from './search.js';

/**
 * Árvore de conteúdo → dados do site estático (SYS-96): a navegação, as
 * settings, a landing e um `PublishedPage` por página, no formato que o
 * `DocsDataSource` devolve. Também resolve os links relativos entre arquivos
 * (`../color/palette.mdx#uso` → URL da página), reescreve o `src` das imagens
 * para a URL no site e lista as imagens que o build precisa copiar. Puro e
 * determinístico: mesma árvore, mesmos dados.
 *
 * Com idiomas (SYS-177), um `StaticSiteData` por código de `settings.locales`:
 * a estrutura é sempre a do padrão; num idioma de tradução, a navegação vem
 * com os títulos e slugs traduzidos, e uma página sem tradução sai com o
 * conteúdo do padrão e `locale` = padrão (fallback). Os links relativos levam
 * à página no mesmo idioma.
 */

/** Id da tab primária (o corpo) no modo estático — reservado, nenhuma tab pode usá-lo. */
export const BODY_TAB_ID = 'index';

/** Imagem referenciada pelo conteúdo, com o caminho resolvido no diretório de conteúdo. */
export interface SiteImage {
  /** Arquivo que a referencia (relativo à pasta do idioma, numa tradução). */
  file: string;
  line: number;
  column: number;
  /** Idioma de tradução do arquivo; `null` = conteúdo do idioma padrão. */
  locale: LocaleCode | null;
  /** Como está escrito no conteúdo. */
  src: string;
  /**
   * Caminho relativo ao diretório de conteúdo — numa tradução, à pasta do
   * idioma, que espelha o diretório de conteúdo; `null` para URL absoluta.
   */
  path: string | null;
  /** `src` que o conteúdo gerado usa (a URL absoluta fica como está). */
  url: string;
}

export interface BuildSiteOptions {
  settings: PublicSettings;
  /** Base de publicação (`/`, `/meu-repo/`), para os links entre páginas e as imagens. */
  base?: string;
  /**
   * URL de uma imagem a partir do caminho no diretório de conteúdo (`locale`
   * `null`) ou na pasta de um idioma de tradução. Padrão: o mesmo caminho sob
   * a base, em qualquer idioma. O build troca para o nome com hash (SYS-100).
   */
  imageUrl?: (path: string, locale: LocaleCode | null) => string;
  /** Previews publicados no site, por `previewKey` (SYS-100). Padrão: nenhum. */
  previews?: Record<string, PublicComponentPreview>;
  /** Design tokens já validados (SYS-130). Padrão: nenhum. */
  tokens?: TokenSet | null;
  /**
   * Árvore de cada idioma de tradução (`buildLocaleTree`), por código de
   * `settings.locales`. Idioma sem árvore sai inteiro em fallback. Padrão: nenhuma.
   */
  translations?: Readonly<Record<LocaleCode, LocaleTree>>;
}

export interface SiteBuild {
  /** Os dados do idioma padrão (`locales[defaultLocale]`). */
  data: StaticSiteData;
  /** Um `StaticSiteData` por idioma de `settings.locales`. */
  locales: StaticSiteDataByLocale;
  /** Imagens dos documentos de todos os idiomas (o fallback não repete as do padrão). */
  images: SiteImage[];
  /** Problemas do conteúdo do idioma padrão. */
  diagnostics: Diagnostic[];
  /**
   * Problemas dos documentos traduzidos, por idioma, com caminhos relativos à
   * pasta do idioma (quem lê o disco prefixa, como em `buildLocaleTree`).
   */
  translationDiagnostics: Record<LocaleCode, Diagnostic[]>;
}

/** URL absoluta, `mailto:`, `//host` etc. — mantida como está. */
const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

/** `/meu-repo/` → `/meu-repo`; `/` → `''`. */
function normalizeBase(base: string): string {
  const trimmed = base.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

/** Junta e normaliza caminhos posix relativos (`a/b` + `../c` → `a/c`); `null` se sair da raiz. */
function joinPath(dir: string, relative: string): string | null {
  const parts = dir ? dir.split('/') : [];
  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.join('/');
}

function dirOf(file: string): string {
  const i = file.lastIndexOf('/');
  return i === -1 ? '' : file.slice(0, i);
}

interface DocRewrite {
  href: (href: string) => string;
  src: (src: string) => string;
}

/**
 * Reescreve o `href` dos links, o `src` das imagens e o do cover de imagem do
 * dos-donts (cópia; o original não muda).
 */
function rewriteDoc(doc: TiptapDoc, rewrite: DocRewrite): TiptapDoc {
  const visit = (node: TiptapNode): TiptapNode => {
    let attrs = node.attrs;
    if (node.type === 'image' && typeof attrs?.src === 'string') {
      attrs = { ...attrs, src: rewrite.src(attrs.src) };
    }
    const cover = attrs?.cover as { kind?: string; src?: unknown } | null | undefined;
    if (node.type === 'dosDonts' && cover?.kind === 'image' && typeof cover.src === 'string') {
      attrs = { ...attrs, cover: { ...cover, src: rewrite.src(cover.src) } };
    }
    return {
      ...node,
      ...(attrs && { attrs }),
      ...(node.marks && {
        marks: node.marks.map((mark) => {
          const m = mark as { type: string; attrs?: Record<string, unknown> };
          return m.type === 'link' && typeof m.attrs?.href === 'string'
            ? { ...m, attrs: { ...m.attrs, href: rewrite.href(m.attrs.href) } }
            : mark;
        }),
      }),
      ...(node.content && { content: node.content.map(visit) }),
    };
  };
  return { ...doc, ...(doc.content && { content: doc.content.map(visit) }) };
}

/** Documento num idioma: o próprio (`own`: do padrão, ou traduzido) ou o do padrão no fallback. */
interface LocaleDocument {
  document: ContentDocument;
  own: boolean;
}

/** Página como sai num idioma, já com o fallback aplicado. */
interface LocalePage {
  base: PageNode;
  /** Tem o corpo no idioma (no padrão, sempre); sem ele, a página inteira é a do padrão. */
  translated: boolean;
  slug: string;
  titulo: string;
  subtitulo: string | null;
  overviewTitulo: string | null;
  body: LocaleDocument;
  tabs: { base: TabNode; slug: string; titulo: string; document: LocaleDocument }[];
}

/** A árvore de um idioma, na forma que o build percorre. */
interface LocaleView {
  code: LocaleCode;
  landing: LocaleDocument | null;
  menus: { slug: string; titulo: string; sections: { slug: string; titulo: string; pages: LocalePage[] }[] }[];
}

/** Página do padrão; `own = false` no fallback de outro idioma. */
function basePage(page: PageNode, own: boolean): LocalePage {
  return {
    base: page,
    translated: own,
    slug: page.slug,
    titulo: page.titulo,
    subtitulo: page.subtitulo,
    overviewTitulo: page.overviewTitulo,
    body: { document: page.body, own },
    tabs: page.tabs.map((tab) => ({ base: tab, slug: tab.slug, titulo: tab.titulo, document: { document: tab, own } })),
  };
}

/**
 * A árvore vista de um idioma. Sem `translation`, o padrão (tudo próprio). Num
 * idioma de tradução, a navegação traduzida, com o fallback que a `LocaleTree`
 * já aplica; e, por página, o conteúdo traduzido — tab sem tradução cai na do
 * padrão — ou, sem o corpo traduzido, a página inteira do padrão (slug, textos
 * e tabs), para o `canonical` do fallback apontar para a mesma tab do original.
 */
function localeView(tree: ContentTree, code: LocaleCode, translation: LocaleTree | null): LocaleView {
  if (!translation) {
    return {
      code,
      landing: tree.landing && { document: tree.landing, own: true },
      menus: tree.menus.map((menu) => ({
        slug: menu.slug,
        titulo: menu.titulo,
        sections: menu.sections.map((section) => ({
          slug: section.slug,
          titulo: section.titulo,
          pages: section.pages.map((page) => basePage(page, true)),
        })),
      })),
    };
  }
  return {
    code,
    landing: translation.landing
      ? { document: translation.landing, own: true }
      : tree.landing && { document: tree.landing, own: false },
    menus: translation.menus.map((menu) => ({
      slug: menu.slug,
      titulo: menu.titulo,
      sections: menu.sections.map((section) => ({
        slug: section.slug,
        titulo: section.titulo,
        pages: section.pages.map((page): LocalePage =>
          page.body
            ? {
                base: page.base,
                translated: true,
                slug: page.slug,
                titulo: page.titulo,
                subtitulo: page.subtitulo,
                overviewTitulo: page.overviewTitulo,
                body: { document: page.body, own: true },
                tabs: page.tabs.map((tab) => ({
                  base: tab.base,
                  slug: tab.slug,
                  titulo: tab.titulo,
                  document: tab.document ? { document: tab.document, own: true } : { document: tab.base, own: false },
                })),
              }
            : basePage(page.base, false),
        ),
      })),
    })),
  };
}

export function buildSiteData(tree: ContentTree, options: BuildSiteOptions): SiteBuild {
  const base = normalizeBase(options.base ?? '/');
  const imageUrl = options.imageUrl ?? ((path: string) => `${base}/${path}`);
  const { settings } = options;
  const defaultLocale = settings.defaultLocale;
  const translations = options.translations ?? {};
  for (const code of Object.keys(translations)) {
    if (code === defaultLocale || !settings.locales.some((locale) => locale.code === code)) {
      throw new Error(`buildSiteData: "${code}" não é um idioma de tradução de settings.locales.`);
    }
  }
  const diagnostics: Diagnostic[] = [];
  const translationDiagnostics: Record<LocaleCode, Diagnostic[]> = {};
  const images: SiteImage[] = [];

  const views = settings.locales.map(({ code }) => {
    if (code === defaultLocale) return localeView(tree, code, null);
    // Idioma sem pasta: o espelho do padrão, todo em fallback.
    return localeView(tree, code, translations[code] ?? buildLocaleTree(tree, []));
  });

  // ---- endereço de cada página nos idiomas em que está traduzida (alternates) ----
  const alternatesOf = new Map<PageNode, Record<LocaleCode, PublicPageRef>>();
  for (const view of views) {
    for (const menu of view.menus) {
      for (const section of menu.sections) {
        for (const page of section.pages) {
          if (!page.translated) continue;
          const alternates = alternatesOf.get(page.base) ?? {};
          alternates[view.code] = { menuSlug: menu.slug, sectionSlug: section.slug, pageSlug: page.slug };
          alternatesOf.set(page.base, alternates);
        }
      }
    }
  }

  /** Blocos de uma tab do snapshot, com ids determinísticos. */
  function blocksFor(key: string, tabId: string, doc: TiptapDoc): Block[] {
    return tiptapDocToBlocks(doc).map((block) => ({
      ...block,
      id: `${key}#${tabId}#${block.ordem}`,
      tabId,
    })) as Block[];
  }

  const locales: StaticSiteDataByLocale = {};
  for (const view of views) {
    const isDefault = view.code === defaultLocale;
    const report = isDefault ? diagnostics : (translationDiagnostics[view.code] = []);

    // ---- URL, neste idioma, de cada arquivo do padrão (destino de links relativos) ----
    // A tradução espelha os caminhos do padrão, então os links dela resolvem no mesmo mapa.
    const urlOf = new Map<string, string>();
    if (tree.landing) urlOf.set(tree.landing.file, `${base}${localizedHomePath(view.code, defaultLocale)}`);
    for (const menu of view.menus) {
      for (const section of menu.sections) {
        for (const page of section.pages) {
          const ref = { menuSlug: menu.slug, sectionSlug: section.slug, pageSlug: page.slug };
          urlOf.set(page.base.body.file, `${base}${localizedSitePath(view.code, ref, defaultLocale)}`);
          for (const tab of page.tabs) urlOf.set(tab.base.file, `${base}${localizedSitePath(view.code, ref, defaultLocale, tab.slug)}`);
        }
      }
    }

    /**
     * Resolve links relativos e imagens de um documento; devolve o doc
     * reescrito. Imagens e problemas só são registrados no documento próprio
     * do idioma — o do padrão num fallback já foi relatado no padrão.
     */
    function resolve({ document, own }: LocaleDocument): TiptapDoc {
      const imageLocale = own && !isDefault ? view.code : null;
      const srcs = new Map<string, string>();
      for (const ref of document.references.images) {
        const at = { file: document.file, line: ref.line, column: ref.column };
        if (EXTERNAL.test(ref.src)) {
          if (own) images.push({ ...at, locale: imageLocale, src: ref.src, path: null, url: ref.src });
          continue;
        }
        // `/x.png` é relativo à raiz do conteúdo; o resto, ao arquivo.
        const path = joinPath(ref.src.startsWith('/') ? '' : dirOf(document.file), ref.src.split(/[?#]/)[0]!);
        if (!path) {
          if (own) {
            report.push({
              ...at,
              message: `imagem "${ref.src}" fica fora do diretório de conteúdo — mova-a para dentro dele.`,
            });
          }
          continue;
        }
        const url = imageUrl(path, imageLocale);
        if (own) images.push({ ...at, locale: imageLocale, src: ref.src, path, url });
        srcs.set(ref.src, url);
      }

      const resolved = new Map<string, string>();
      for (const ref of document.references.links) {
        const href = ref.href;
        if (EXTERNAL.test(href) || href.startsWith('#') || resolved.has(href)) continue;
        // Caminho do site (`/foundation/...`): só ganha a base.
        if (href.startsWith('/')) {
          resolved.set(href, `${base}${href}`);
          continue;
        }
        const [target = '', anchor] = href.split('#', 2) as [string, string | undefined];
        const filePath = joinPath(dirOf(document.file), target.split('?')[0]!);
        const url = filePath === null ? undefined : urlOf.get(filePath);
        if (!url) {
          if (own) {
            report.push({
              file: document.file,
              line: ref.line,
              column: ref.column,
              message: `link para "${href}" não leva a uma página ou tab do conteúdo — confira o caminho relativo (ex.: ../seção/página.mdx).`,
            });
          }
          continue;
        }
        resolved.set(href, anchor ? `${url}#${anchor}` : url);
      }
      return resolved.size || srcs.size
        ? rewriteDoc(document.doc, { href: (href) => resolved.get(href) ?? href, src: (src) => srcs.get(src) ?? src })
        : document.doc;
    }

    // ---- navegação e páginas ----
    const nav: PublicNavTree = [];
    const pages: Record<string, PublishedPage> = {};

    view.menus.forEach((menu, menuIndex) => {
      nav.push({
        id: menu.slug,
        titulo: menu.titulo,
        slug: menu.slug,
        ordem: menuIndex,
        sections: menu.sections.map((section) => ({
          id: `${menu.slug}/${section.slug}`,
          titulo: section.titulo,
          slug: section.slug,
          pages: section.pages.map((page) => {
            const key = pageKey({ menuSlug: menu.slug, sectionSlug: section.slug, pageSlug: page.slug });
            const snapshot: PageSnapshot = {
              tabs: [
                { tabId: BODY_TAB_ID, titulo: page.overviewTitulo ?? 'Overview', isPrimary: true, blocks: blocksFor(key, BODY_TAB_ID, resolve(page.body)) },
                ...page.tabs.map((tab) => ({
                  tabId: tab.slug,
                  titulo: tab.titulo,
                  isPrimary: false,
                  blocks: blocksFor(key, tab.slug, resolve(tab.document)),
                })),
              ],
            };
            pages[key] = {
              pageId: key,
              titulo: page.titulo,
              subtitulo: page.subtitulo,
              snapshot,
              locale: page.translated ? view.code : defaultLocale,
              alternates: alternatesOf.get(page.base)!,
            };
            return { id: key, titulo: page.titulo, slug: page.slug };
          }),
        })),
      });
    });

    const landing: PageSnapshot | null = view.landing
      ? { tabs: [{ tabId: BODY_TAB_ID, titulo: 'Overview', isPrimary: true, blocks: blocksFor('', BODY_TAB_ID, resolve(view.landing)) }] }
      : null;

    locales[view.code] = { settings, nav, landing, pages, previews: options.previews ?? {}, tokens: nonEmptyTokenSet(options.tokens) };
  }

  return { data: locales[defaultLocale]!, locales, images, diagnostics, translationDiagnostics };
}

/** Os arquivos de um idioma, relativos à pasta dele. */
function localeFiles(data: StaticSiteData): [string, string][] {
  return [
    [staticDataPaths.nav, json(data.nav)],
    [staticDataPaths.landing, json(data.landing)],
    [staticDataPaths.search, json(createSearchIndex(data))],
    ...Object.keys(data.pages)
      .sort()
      .map((key): [string, string] => [staticDataPaths.page(parsePageKey(key)), json(data.pages[key])]),
  ];
}

const json = (value: unknown) => `${JSON.stringify(value)}\n`;

/**
 * Os arquivos JSON do site (caminho relativo → conteúdo), nos caminhos de
 * `staticDataPaths`. Saída estável: mesmos dados, mesmos bytes.
 */
export function siteDataFiles(data: StaticSiteData): Map<string, string> {
  const [nav, landing, search, ...pages] = localeFiles(data);
  return new Map([
    [staticDataPaths.settings, json(data.settings)],
    nav!,
    landing!,
    [staticDataPaths.previews, json(sortedRecord(data.previews))],
    [staticDataPaths.tokens, json(data.tokens)],
    search!,
    ...pages,
  ]);
}

/**
 * Os arquivos do site em todos os idiomas (SYS-177): o padrão exatamente como
 * `siteDataFiles` — com um idioma só, a mesma saída — e cada idioma de
 * tradução com navegação, landing, busca e páginas na própria pasta
 * (`localeDataDir`). Settings, previews e tokens são iguais em todos e ficam só
 * na raiz.
 */
export function siteDataFilesByLocale(locales: StaticSiteDataByLocale): Map<string, string> {
  const first = Object.values(locales)[0];
  if (!first) throw new Error('siteDataFilesByLocale: nenhum idioma.');
  const { defaultLocale } = first.settings;
  const files = siteDataFiles(locales[defaultLocale]!);
  for (const { code } of first.settings.locales) {
    if (code === defaultLocale) continue;
    const dir = localeDataDir(code, defaultLocale);
    for (const [file, content] of localeFiles(locales[code]!)) files.set(`${dir}${file}`, content);
  }
  return files;
}

/** Cópia com as chaves em ordem, para o JSON não depender da ordem de inserção. */
function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]!]));
}
