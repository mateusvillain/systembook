import type {
  Block,
  PageSnapshot,
  PublicNavTree,
  PublicSettings,
  PublishedPage,
  StaticSiteData,
} from '@systembook/schema';
import { tiptapDocToBlocks, type TiptapDoc, type TiptapNode } from '../blocks.js';
import type { Diagnostic } from '../diagnostics.js';
import type { ContentDocument, ContentTree } from '../tree/types.js';
import { pageKey, staticDataPaths } from './paths.js';

/**
 * Árvore de conteúdo → dados do site estático (SYS-96): a navegação, as
 * settings, a landing e um `PublishedPage` por página, no formato que o
 * `DocsDataSource` devolve. Também resolve os links relativos entre arquivos
 * (`../color/palette.mdx#uso` → URL da página) e lista as imagens que o build
 * precisa copiar. Puro e determinístico: mesma árvore, mesmos dados.
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
}

export interface BuildSiteOptions {
  settings: PublicSettings;
  /** Base de publicação (`/`, `/meu-repo/`), para os links entre páginas. */
  base?: string;
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

/** Aplica `rewrite` ao `href` de cada mark de link do doc (cópia; o original não muda). */
function rewriteLinks(doc: TiptapDoc, rewrite: (href: string) => string): TiptapDoc {
  const visit = (node: TiptapNode): TiptapNode => ({
    ...node,
    ...(node.marks && {
      marks: node.marks.map((mark) => {
        const m = mark as { type: string; attrs?: Record<string, unknown> };
        return m.type === 'link' && typeof m.attrs?.href === 'string'
          ? { ...m, attrs: { ...m.attrs, href: rewrite(m.attrs.href) } }
          : mark;
      }),
    }),
    ...(node.content && { content: node.content.map(visit) }),
  });
  return { ...doc, ...(doc.content && { content: doc.content.map(visit) }) };
}

export function buildSiteData(tree: ContentTree, options: BuildSiteOptions): SiteBuild {
  const base = normalizeBase(options.base ?? '/');
  const diagnostics: Diagnostic[] = [];
  const images: SiteImage[] = [];

  // ---- URL de cada arquivo de conteúdo (destino de links relativos) ----
  const urlOf = new Map<string, string>();
  if (tree.landing) urlOf.set(tree.landing.file, `${base}/`);
  for (const menu of tree.menus) {
    for (const section of menu.sections) {
      for (const page of section.pages) {
        const pageUrl = `${base}/${menu.slug}/${section.slug}/${page.slug}`;
        urlOf.set(page.body.file, pageUrl);
        for (const tab of page.tabs) urlOf.set(tab.file, `${pageUrl}/${tab.slug}`);
      }
    }
  }

  /** Resolve links relativos e coleta imagens de um documento; devolve o doc reescrito. */
  function resolve(document: ContentDocument): TiptapDoc {
    for (const ref of document.references.images) {
      const external = EXTERNAL.test(ref.src);
      images.push({
        file: document.file,
        line: ref.line,
        column: ref.column,
        src: ref.src,
        path: external ? null : ref.src.startsWith('/') ? joinPath('', ref.src) : joinPath(dirOf(document.file), ref.src),
      });
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
    return resolved.size ? rewriteLinks(document.doc, (href) => resolved.get(href) ?? href) : document.doc;
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
              { tabId: BODY_TAB_ID, titulo: 'Overview', isPrimary: true, blocks: blocksFor(key, BODY_TAB_ID, resolve(page.body)) },
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

  return { data: { settings: options.settings, nav, landing, pages }, images, diagnostics };
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
  ]);
  for (const key of Object.keys(data.pages).sort()) {
    const [menuSlug = '', sectionSlug = '', pageSlug = ''] = key.split('/');
    files.set(staticDataPaths.page({ menuSlug, sectionSlug, pageSlug }), json(data.pages[key]));
  }
  return files;
}
