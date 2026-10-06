import type {
  Block,
  PageSnapshot,
  PublicComponentPreview,
  PublicNavTree,
  PublicSettings,
  PublishedPage,
  StaticSiteData,
  TokenSet,
} from '@systembook/schema';
import { tiptapDocToBlocks, type TiptapDoc, type TiptapNode } from '../blocks.js';
import type { Diagnostic } from '../diagnostics.js';
import type { ContentDocument, ContentTree } from '../tree/types.js';
import { pageKey, parsePageKey, sitePath, staticDataPaths } from './paths.js';
import { createSearchIndex } from './search.js';

/**
 * Árvore de conteúdo → dados do site estático (SYS-96): a navegação, as
 * settings, a landing e um `PublishedPage` por página, no formato que o
 * `DocsDataSource` devolve. Também resolve os links relativos entre arquivos
 * (`../color/palette.mdx#uso` → URL da página), reescreve o `src` das imagens
 * para a URL no site e lista as imagens que o build precisa copiar. Puro e
 * determinístico: mesma árvore, mesmos dados.
 */

/** Id da tab primária (o corpo) no modo estático — reservado, nenhuma tab pode usá-lo. */
export const BODY_TAB_ID = 'index';

/** Imagem referenciada pelo conteúdo, com o caminho resolvido no diretório de conteúdo. */
export interface SiteImage {
  /** Arquivo que a referencia. */
  file: string;
  line: number;
  column: number;
  /** Como está escrito no conteúdo. */
  src: string;
  /** Caminho relativo ao diretório de conteúdo; `null` para URL absoluta. */
  path: string | null;
  /** `src` que o conteúdo gerado usa (a URL absoluta fica como está). */
  url: string;
}

export interface BuildSiteOptions {
  settings: PublicSettings;
  /** Base de publicação (`/`, `/meu-repo/`), para os links entre páginas e as imagens. */
  base?: string;
  /**
   * URL de uma imagem a partir do caminho no diretório de conteúdo. Padrão:
   * o mesmo caminho sob a base. O build troca para o nome com hash (SYS-100).
   */
  imageUrl?: (path: string) => string;
  /** Previews publicados no site, por `previewKey` (SYS-100). Padrão: nenhum. */
  previews?: Record<string, PublicComponentPreview>;
  /** Design tokens já validados (SYS-130). Padrão: nenhum. */
  tokens?: TokenSet | null;
}

export interface SiteBuild {
  data: StaticSiteData;
  images: SiteImage[];
  diagnostics: Diagnostic[];
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

export function buildSiteData(tree: ContentTree, options: BuildSiteOptions): SiteBuild {
  const base = normalizeBase(options.base ?? '/');
  const imageUrl = options.imageUrl ?? ((path: string) => `${base}/${path}`);
  const diagnostics: Diagnostic[] = [];
  const images: SiteImage[] = [];

  // ---- URL de cada arquivo de conteúdo (destino de links relativos) ----
  const urlOf = new Map<string, string>();
  if (tree.landing) urlOf.set(tree.landing.file, `${base}/`);
  for (const menu of tree.menus) {
    for (const section of menu.sections) {
      for (const page of section.pages) {
        const ref = { menuSlug: menu.slug, sectionSlug: section.slug, pageSlug: page.slug };
        urlOf.set(page.body.file, `${base}${sitePath(ref)}`);
        for (const tab of page.tabs) urlOf.set(tab.file, `${base}${sitePath(ref, tab.slug)}`);
      }
    }
  }

  /** Resolve links relativos e imagens de um documento; devolve o doc reescrito. */
  function resolve(document: ContentDocument): TiptapDoc {
    const srcs = new Map<string, string>();
    for (const ref of document.references.images) {
      const at = { file: document.file, line: ref.line, column: ref.column };
      if (EXTERNAL.test(ref.src)) {
        images.push({ ...at, src: ref.src, path: null, url: ref.src });
        continue;
      }
      // `/x.png` é relativo à raiz do conteúdo; o resto, ao arquivo.
      const path = joinPath(ref.src.startsWith('/') ? '' : dirOf(document.file), ref.src.split(/[?#]/)[0]!);
      if (!path) {
        diagnostics.push({
          ...at,
          message: `imagem "${ref.src}" fica fora do diretório de conteúdo — mova-a para dentro dele.`,
        });
        continue;
      }
      const url = imageUrl(path);
      images.push({ ...at, src: ref.src, path, url });
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
        diagnostics.push({
          file: document.file,
          line: ref.line,
          column: ref.column,
          message: `link para "${href}" não leva a uma página ou tab do conteúdo — confira o caminho relativo (ex.: ../seção/página.mdx).`,
        });
        continue;
      }
      resolved.set(href, anchor ? `${url}#${anchor}` : url);
    }
    return resolved.size || srcs.size
      ? rewriteDoc(document.doc, { href: (href) => resolved.get(href) ?? href, src: (src) => srcs.get(src) ?? src })
      : document.doc;
  }

  /** Blocos de uma tab do snapshot, com ids determinísticos. */
  function blocksFor(key: string, tabId: string, doc: TiptapDoc): Block[] {
    return tiptapDocToBlocks(doc).map((block) => ({
      ...block,
      id: `${key}#${tabId}#${block.ordem}`,
      tabId,
    })) as Block[];
  }

  // ---- navegação e páginas ----
  const nav: PublicNavTree = [];
  const pages: Record<string, PublishedPage> = {};

  tree.menus.forEach((menu, menuIndex) => {
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
          const ref = { menuSlug: menu.slug, sectionSlug: section.slug, pageSlug: page.slug };
          const key = pageKey(ref);
          const snapshot: PageSnapshot = {
            tabs: [
              { tabId: BODY_TAB_ID, titulo: page.overviewTitulo ?? 'Overview', isPrimary: true, blocks: blocksFor(key, BODY_TAB_ID, resolve(page.body)) },
              ...page.tabs.map((tab) => ({
                tabId: tab.slug,
                titulo: tab.titulo,
                isPrimary: false,
                blocks: blocksFor(key, tab.slug, resolve(tab)),
              })),
            ],
          };
          pages[key] = { pageId: key, titulo: page.titulo, subtitulo: page.subtitulo, snapshot };
          return { id: key, titulo: page.titulo, slug: page.slug };
        }),
      })),
    });
  });

  const landing: PageSnapshot | null = tree.landing
    ? { tabs: [{ tabId: BODY_TAB_ID, titulo: 'Overview', isPrimary: true, blocks: blocksFor('', BODY_TAB_ID, resolve(tree.landing)) }] }
    : null;

  // Lista vazia é `null`: o contrato do `getTokens` não distingue "sem tokens" de "nenhum válido".
  const tokens = options.tokens?.tokens.length ? options.tokens : null;
  return { data: { settings: options.settings, nav, landing, pages, previews: options.previews ?? {}, tokens }, images, diagnostics };
}

/**
 * Os arquivos JSON do site (caminho relativo → conteúdo), nos caminhos de
 * `staticDataPaths`. Saída estável: mesmos dados, mesmos bytes.
 */
export function siteDataFiles(data: StaticSiteData): Map<string, string> {
  const json = (value: unknown) => `${JSON.stringify(value)}\n`;
  const files = new Map<string, string>([
    [staticDataPaths.settings, json(data.settings)],
    [staticDataPaths.nav, json(data.nav)],
    [staticDataPaths.landing, json(data.landing)],
    [staticDataPaths.previews, json(sortedRecord(data.previews))],
    [staticDataPaths.tokens, json(data.tokens)],
    [staticDataPaths.search, json(createSearchIndex(data))],
  ]);
  for (const key of Object.keys(data.pages).sort()) {
    files.set(staticDataPaths.page(parsePageKey(key)), json(data.pages[key]));
  }
  return files;
}

/** Cópia com as chaves em ordem, para o JSON não depender da ordem de inserção. */
function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]!]));
}
