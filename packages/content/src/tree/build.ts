import { didYouMean, DiagnosticBag, type Diagnostic } from '../diagnostics.js';
import { folderMetaSchema, readYamlFields, SLUG_PATTERN, type DocumentKind, type FolderMeta } from '../frontmatter.js';
import { parseDocument } from '../parse/index.js';
import type {
  BuildTreeOptions,
  ContentDocument,
  ContentFile,
  ContentTree,
  LandingNode,
  MenuNode,
  PageNode,
  SectionNode,
  TabNode,
} from './types.js';

/**
 * Monta a árvore de navegação (menus → seções → páginas → tabs) a partir dos
 * arquivos do diretório de conteúdo (SYS-95). As regras estão em
 * `docs/static-format.md` ("Estrutura de pastas", "Slugs e URLs", "Ordenação").
 * Puro: recebe os arquivos já lidos, então é testável sem disco.
 *
 * Em três fases: classificar cada arquivo pelo lugar que ocupa (`classify`),
 * ler páginas e pastas, e montar a árvore ordenada checando slugs repetidos.
 */

const CONTENT_FILE = /\.(md|mdx)$/;
const META_FILES = ['_menu.yml', '_section.yml'] as const;

// ---- utilitários puros ----

/** `a\b`, `./a/b/`, `/a//b` → `a/b`. */
function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}

/** "get-started" → "Get started". */
function humanize(slug: string): string {
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Primeiro por `order` (sem `order` vão depois), depois pelo slug. */
function byOrder<T extends { order: number | undefined; slug: string }>(a: T, b: T): number {
  if (a.order !== b.order) {
    if (a.order === undefined) return 1;
    if (b.order === undefined) return -1;
    return a.order - b.order;
  }
  return a.slug.localeCompare(b.slug);
}

/** Nome sem extensão e o formato do arquivo. */
function splitName(name: string): { base: string; format: 'md' | 'mdx' } {
  const format = name.endsWith('.mdx') ? 'mdx' : 'md';
  return { base: name.slice(0, -(format.length + 1)), format };
}

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Ignorados: qualquer segmento que comece com `_` ou `.`, exceto os yml de meta no fim. */
function isIgnored(segments: string[]): boolean {
  return segments.some(
    (segment, i) =>
      (segment.startsWith('_') || segment.startsWith('.')) &&
      !(i === segments.length - 1 && (META_FILES as readonly string[]).includes(segment)),
  );
}

/** Item com o caminho de onde veio, para as mensagens de slug repetido. */
interface Located<T> {
  node: T;
  origin: string;
}

// ---- fase 1: classificar ----

interface Folder {
  path: string;
  name: string;
  metaFile: ContentFile | null;
}

interface PageFolder {
  path: string;
  name: string;
  index: ContentFile | null;
  tabs: ContentFile[];
}

interface Classified {
  landing: ContentFile | null;
  menus: Map<string, Folder>;
  sections: Map<string, Folder>;
  /** Seção → arquivos de página soltos. */
  pageFiles: Map<string, ContentFile[]>;
  /** Caminho da pasta → página com tabs. */
  pageFolders: Map<string, PageFolder>;
}

function classify(files: readonly ContentFile[], report: (file: string, message: string) => void): Classified {
  const out: Classified = {
    landing: null,
    menus: new Map(),
    sections: new Map(),
    pageFiles: new Map(),
    pageFolders: new Map(),
  };
  const folder = (map: Map<string, Folder>, path: string) => {
    if (!map.has(path)) map.set(path, { path, name: lastSegment(path), metaFile: null });
    return map.get(path)!;
  };
  const metaHere = { 2: '_menu.yml', 3: '_section.yml' } as const;

  const normalized = files
    .map((file) => ({ ...file, path: normalizePath(file.path) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of normalized) {
    const segments = file.path.split('/');
    if (isIgnored(segments)) continue;
    const name = segments[segments.length - 1]!;
    const depth = segments.length;

    // Meta no lugar errado não pode sumir em silêncio.
    if ((META_FILES as readonly string[]).includes(name)) {
      if (metaHere[depth as 2 | 3] !== name) {
        const where = name === '_menu.yml' ? 'na pasta do menu (menu/_menu.yml)' : 'na pasta da seção (menu/seção/_section.yml)';
        report(file.path, `${name} fora do lugar — ele fica ${where}.`);
        continue;
      }
      folder(depth === 2 ? out.menus : out.sections, segments.slice(0, -1).join('/')).metaFile = file;
      if (depth === 3) folder(out.menus, segments[0]!);
      continue;
    }

    if (!CONTENT_FILE.test(name)) {
      if (/\.(md|mdx)$/i.test(name)) {
        report(file.path, `extensão em maiúsculas — renomeie para .${name.split('.').pop()!.toLowerCase()}.`);
      }
      continue; // imagens e outros arquivos ficam no disco
    }

    const base = splitName(name).base;
    switch (depth) {
      case 1:
        if (base !== 'index') {
          report(file.path, 'página na raiz do conteúdo — toda página precisa de um menu e uma seção (menu/seção/página.mdx).');
        } else if (out.landing) {
          report(file.path, `a landing já está em ${out.landing.path} — deixe só um index.`);
        } else out.landing = file;
        break;
      case 2:
        report(file.path, 'página direto no menu — coloque-a numa seção (menu/seção/página.mdx).');
        break;
      case 3: {
        if (base === 'index') {
          report(file.path, 'index solto numa seção — o index é o corpo de uma página, dentro da pasta dela (menu/seção/página/index.mdx).');
          break;
        }
        folder(out.menus, segments[0]!);
        const section = folder(out.sections, segments.slice(0, 2).join('/'));
        out.pageFiles.set(section.path, [...(out.pageFiles.get(section.path) ?? []), file]);
        break;
      }
      case 4: {
        folder(out.menus, segments[0]!);
        folder(out.sections, segments.slice(0, 2).join('/'));
        const path = segments.slice(0, 3).join('/');
        const page = out.pageFolders.get(path) ?? { path, name: segments[2]!, index: null, tabs: [] };
        if (base !== 'index') page.tabs.push(file);
        else if (page.index) report(file.path, `o corpo da página já está em ${page.index.path} — deixe só um index.`);
        else page.index = file;
        out.pageFolders.set(path, page);
        break;
      }
      default:
        report(file.path, 'subpasta dentro da pasta de uma página não é permitida — tabs ficam direto na pasta da página.');
    }
  }
  return out;
}

// ---- fases 2 e 3: ler e montar ----

export function buildContentTree(files: readonly ContentFile[], options: BuildTreeOptions = {}): ContentTree {
  const diagnostics: Diagnostic[] = [];
  const report = (file: string, message: string) => diagnostics.push({ file, line: 1, column: 1, message });
  const statusTags = options.statusTags ?? [];

  const classified = classify(files, report);

  function read<K extends DocumentKind>(file: ContentFile, kind: K) {
    const parsed = parseDocument(file.source, { file: file.path, format: splitName(file.path).format, kind });
    diagnostics.push(...parsed.diagnostics);
    const document: ContentDocument = { file: file.path, doc: parsed.doc, references: parsed.references };
    return { frontmatter: parsed.frontmatter, document };
  }

  function readMeta(file: ContentFile | null): FolderMeta | null {
    if (!file) return null;
    const bag = new DiagnosticBag(file.path);
    const meta = readYamlFields(file.source, {
      schema: folderMetaSchema,
      firstLine: 1,
      at: { line: 1, column: 1 },
      prefix: '',
      bag,
    });
    diagnostics.push(...bag.items);
    return meta;
  }

  /** Slug de arquivo (página ou tab): frontmatter > nome do arquivo, validado. */
  function fileSlug(file: ContentFile, override: string | undefined): string | null {
    const slug = override ?? splitName(lastSegment(file.path)).base;
    if (SLUG_PATTERN.test(slug)) return slug;
    report(file.path, `nome de arquivo "${slug}" não é um slug válido — renomeie (minúsculas, dígitos e hífens) ou defina "slug" no frontmatter.`);
    return null;
  }

  /** Slug de pasta (menu, seção): yml > nome da pasta, validado. */
  function folderSlug(folder: Folder, meta: FolderMeta | null, kind: 'menu' | 'seção'): string | null {
    const slug = meta?.slug ?? folder.name;
    if (SLUG_PATTERN.test(slug)) return slug;
    const metaFile = `${folder.path}/${kind === 'menu' ? '_menu.yml' : '_section.yml'}`;
    report(`${folder.path}/`, `nome de ${kind} "${folder.name}" não é um slug válido — renomeie a pasta (minúsculas, dígitos e hífens) ou defina "slug" em ${metaFile}.`);
    return null;
  }

  function validStatus(status: string | undefined, file: string): string | null {
    if (status === undefined) return null;
    if (statusTags.includes(status)) return status;
    const accepted = statusTags.length ? statusTags.map((t) => `"${t}"`).join(', ') : 'nenhuma (defina statusTags na config)';
    report(file, `frontmatter: status "${status}" não existe${didYouMean(status, statusTags)} — aceitas: ${accepted}.`);
    return null;
  }

  /** Descarta (com erro) os itens cujo slug já apareceu no mesmo nível. */
  function unique<T extends { slug: string; order: number | undefined }>(items: Located<T>[], what: string): T[] {
    const seen = new Map<string, string>();
    return items
      .sort((a, b) => byOrder(a.node, b.node))
      .filter(({ node, origin }) => {
        const first = seen.get(node.slug);
        if (first) {
          report(origin, `${what} com slug "${node.slug}" repetido (já existe em ${first}).`);
          return false;
        }
        seen.set(node.slug, origin);
        return true;
      })
      .map(({ node }) => node);
  }

  function pageFromFile(file: ContentFile): PageNode | null {
    const { frontmatter, document } = read(file, 'page');
    if (!frontmatter) return null;
    const slug = fileSlug(file, frontmatter.slug);
    if (!slug) return null;
    return {
      slug,
      titulo: frontmatter.title,
      subtitulo: frontmatter.subtitle ?? null,
      overviewTitulo: frontmatter.overviewTitle ?? null,
      status: validStatus(frontmatter.status, file.path),
      order: frontmatter.order,
      body: document,
      tabs: [],
    };
  }

  function pageFromFolder(folder: PageFolder): PageNode | null {
    const tabs: Located<TabNode>[] = [];
    for (const file of folder.tabs) {
      const { frontmatter, document } = read(file, 'tab');
      if (!frontmatter) continue;
      const slug = fileSlug(file, frontmatter.slug);
      if (!slug) continue;
      if (slug === 'index') {
        report(file.path, '"index" é reservado ao corpo da página — escolha outro slug para a tab.');
        continue;
      }
      tabs.push({ node: { ...document, slug, titulo: frontmatter.title, order: frontmatter.order }, origin: file.path });
    }
    if (!folder.index) {
      report(`${folder.path}/`, `a pasta da página "${folder.name}" precisa de um index.mdx (o corpo da página).`);
      return null;
    }

    const { frontmatter, document } = read(folder.index, 'page');
    if (!frontmatter) return null;
    // O slug é o da pasta, a menos que o index o sobrescreva.
    const slug = frontmatter.slug ?? folder.name;
    if (!SLUG_PATTERN.test(slug)) {
      report(`${folder.path}/`, `nome de pasta "${folder.name}" não é um slug válido — renomeie ou defina "slug" no frontmatter do index.`);
      return null;
    }
    return {
      slug,
      titulo: frontmatter.title,
      subtitulo: frontmatter.subtitle ?? null,
      overviewTitulo: frontmatter.overviewTitle ?? null,
      status: validStatus(frontmatter.status, folder.index.path),
      order: frontmatter.order,
      body: document,
      tabs: unique(tabs, 'tab'),
    };
  }

  const menus: Located<MenuNode>[] = [];
  for (const menu of classified.menus.values()) {
    const menuMeta = readMeta(menu.metaFile);
    const menuSlug = folderSlug(menu, menuMeta, 'menu');
    const sections: Located<SectionNode>[] = [];

    for (const section of classified.sections.values()) {
      if (!section.path.startsWith(`${menu.path}/`)) continue;
      const sectionMeta = readMeta(section.metaFile);
      const sectionSlug = folderSlug(section, sectionMeta, 'seção');

      const pages: Located<PageNode>[] = [];
      for (const file of classified.pageFiles.get(section.path) ?? []) {
        const node = pageFromFile(file);
        if (node) pages.push({ node, origin: file.path });
      }
      for (const folder of classified.pageFolders.values()) {
        if (!folder.path.startsWith(`${section.path}/`)) continue;
        const node = pageFromFolder(folder);
        if (node) pages.push({ node, origin: `${folder.path}/` });
      }

      // Seção sem páginas válidas some (os erros das páginas já foram relatados).
      if (!sectionSlug || !pages.length) continue;
      sections.push({
        node: {
          slug: sectionSlug,
          titulo: sectionMeta?.title ?? humanize(sectionSlug),
          order: sectionMeta?.order,
          pages: unique(pages, 'página'),
        },
        origin: `${section.path}/`,
      });
    }

    if (!menuSlug || !sections.length) continue;
    menus.push({
      node: {
        slug: menuSlug,
        titulo: menuMeta?.title ?? humanize(menuSlug),
        order: menuMeta?.order,
        sections: unique(sections, 'seção'),
      },
      origin: `${menu.path}/`,
    });
  }

  let landing: LandingNode | null = null;
  if (classified.landing) {
    const { frontmatter, document } = read(classified.landing, 'landing');
    landing = { ...document, titulo: frontmatter?.title ?? null };
  }

  return { landing, menus: unique(menus, 'menu'), diagnostics };
}
