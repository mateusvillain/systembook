import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { didYouMean, DiagnosticBag, type Diagnostic } from '../diagnostics.js';
import type { DocumentKind } from '../frontmatter.js';
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
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONTENT_FILE = /\.(md|mdx)$/;

/** `_menu.yml` / `_section.yml`. */
const metaSchema = z.strictObject({
  title: z.string().trim().min(1, 'não pode ser vazio').optional(),
  order: z.number().int('precisa ser um número inteiro').optional(),
  slug: z.string().regex(SLUG, 'precisa ser um slug: minúsculas, dígitos e hífens simples').optional(),
});
type Meta = z.infer<typeof metaSchema>;

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

/** Ignorados: qualquer segmento que comece com `_` ou `.` (exceto os `.yml` de meta). */
function isIgnored(segments: string[]): boolean {
  return segments.some((segment, i) => {
    if (!segment.startsWith('_') && !segment.startsWith('.')) return false;
    const last = i === segments.length - 1;
    return !(last && (segment === '_menu.yml' || segment === '_section.yml'));
  });
}

interface Folder {
  /** Caminho relativo (`foundation/color`). */
  path: string;
  name: string;
  meta: Meta | null;
}

interface PageFolder {
  path: string;
  name: string;
  index: ContentFile | null;
  tabs: ContentFile[];
}

export function buildContentTree(files: readonly ContentFile[], options: BuildTreeOptions = {}): ContentTree {
  const diagnostics: Diagnostic[] = [];
  const structural = (file: string, message: string) =>
    diagnostics.push({ file, line: 1, column: 1, message });

  /** Lê e valida um arquivo de conteúdo; devolve o frontmatter (ou null) e o documento. */
  function read<K extends DocumentKind>(file: ContentFile, kind: K) {
    const { format } = splitName(file.path);
    const parsed = parseDocument(file.source, { file: file.path, format, kind });
    diagnostics.push(...parsed.diagnostics);
    const document: ContentDocument = { file: file.path, doc: parsed.doc, references: parsed.references };
    return { frontmatter: parsed.frontmatter, document };
  }

  function readMeta(file: ContentFile): Meta | null {
    const bag = new DiagnosticBag(file.path);
    let data: unknown;
    try {
      data = parseYaml(file.source) ?? {};
    } catch (error) {
      bag.report({ line: 1, column: 1 }, `YAML inválido — ${(error as Error).message.split('\n')[0]!.replace(/\.?$/, '.')}`);
      diagnostics.push(...bag.items);
      return null;
    }
    const result = metaSchema.safeParse(data);
    if (result.success) return result.data;
    const known = Object.keys(metaSchema.shape);
    for (const issue of result.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) bag.report({ line: 1, column: 1 }, `"${key}" não é um campo aceito${didYouMean(key, known)} — use title, order ou slug.`);
      } else {
        bag.report({ line: 1, column: 1 }, `"${issue.path.join('.')}" ${issue.message}.`);
      }
    }
    diagnostics.push(...bag.items);
    return null;
  }

  // ---- 1. Classifica os arquivos por profundidade ----
  let landingFile: ContentFile | null = null;
  const menus = new Map<string, Folder>();
  const sections = new Map<string, Folder>();
  const pageFiles = new Map<string, ContentFile[]>(); // seção → arquivos de página soltos
  const pageFolders = new Map<string, PageFolder>(); // caminho da pasta → página com tabs

  const ensureMenu = (name: string) => {
    if (!menus.has(name)) menus.set(name, { path: name, name, meta: null });
    return menus.get(name)!;
  };
  const ensureSection = (menu: string, name: string) => {
    ensureMenu(menu);
    const path = `${menu}/${name}`;
    if (!sections.has(path)) sections.set(path, { path, name, meta: null });
    return sections.get(path)!;
  };

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const segments = file.path.split('/').filter(Boolean);
    if (isIgnored(segments)) continue;
    const name = segments[segments.length - 1]!;
    const isContent = CONTENT_FILE.test(name);

    switch (segments.length) {
      case 1:
        if (!isContent) continue;
        if (splitName(name).base === 'index') {
          if (landingFile) structural(file.path, `a landing já está em ${landingFile.path} — deixe só um index.`);
          else landingFile = file;
        } else {
          structural(file.path, 'página na raiz do conteúdo — toda página precisa de um menu e uma seção (menu/seção/página.mdx).');
        }
        continue;
      case 2:
        if (name === '_menu.yml') ensureMenu(segments[0]!).meta = readMeta(file);
        else if (isContent) structural(file.path, 'página direto no menu — coloque-a numa seção (menu/seção/página.mdx).');
        continue;
      case 3: {
        const section = ensureSection(segments[0]!, segments[1]!);
        if (name === '_section.yml') section.meta = readMeta(file);
        else if (isContent) {
          const list = pageFiles.get(section.path) ?? [];
          list.push(file);
          pageFiles.set(section.path, list);
        }
        continue;
      }
      case 4: {
        if (!isContent) continue;
        ensureSection(segments[0]!, segments[1]!);
        const path = segments.slice(0, 3).join('/');
        const folder = pageFolders.get(path) ?? { path, name: segments[2]!, index: null, tabs: [] };
        if (splitName(name).base === 'index') {
          if (folder.index) structural(file.path, `o corpo da página já está em ${folder.index.path} — deixe só um index.`);
          else folder.index = file;
        } else folder.tabs.push(file);
        pageFolders.set(path, folder);
        continue;
      }
      default:
        if (isContent) {
          structural(file.path, 'subpasta dentro da pasta de uma página não é permitida — tabs ficam direto na pasta da página.');
        }
    }
  }

  // ---- 2. Slugs de pasta (menu, seção) ----
  function folderSlug(folder: Folder, kind: 'menu' | 'seção', metaFile: string): string | null {
    const slug = folder.meta?.slug ?? folder.name;
    if (!SLUG.test(slug)) {
      structural(
        folder.path,
        `nome de ${kind} "${folder.name}" não é um slug válido — renomeie a pasta (minúsculas, dígitos e hífens) ou defina "slug" em ${metaFile}.`,
      );
      return null;
    }
    return slug;
  }

  function checkDuplicates<T extends { slug: string }>(items: T[], where: (item: T) => string, what: string): T[] {
    const seen = new Map<string, T>();
    return items.filter((item) => {
      const first = seen.get(item.slug);
      if (first) {
        structural(where(item), `${what} com slug "${item.slug}" repetido (já existe em ${where(first)}).`);
        return false;
      }
      seen.set(item.slug, item);
      return true;
    });
  }

  // ---- 3. Páginas ----
  const statusTags = options.statusTags;
  const pageOrigins = new WeakMap<PageNode, string>();

  function validStatus(status: string | undefined, file: string): string | null {
    if (status === undefined) return null;
    if (statusTags && !statusTags.includes(status)) {
      const accepted = statusTags.length ? statusTags.map((t) => `"${t}"`).join(', ') : 'nenhuma (defina statusTags na config)';
      structural(file, `frontmatter: status "${status}" não existe${didYouMean(status, statusTags)} — aceitas: ${accepted}.`);
    }
    return status;
  }

  function pageFromFile(file: ContentFile): PageNode | null {
    const { frontmatter, document } = read(file, 'page');
    if (!frontmatter) return null;
    const slug = frontmatter.slug ?? splitName(file.path.split('/').pop()!).base;
    if (!SLUG.test(slug)) {
      structural(file.path, `nome de arquivo "${slug}" não é um slug válido — renomeie (minúsculas, dígitos e hífens) ou defina "slug" no frontmatter.`);
      return null;
    }
    const page: PageNode = {
      slug,
      titulo: frontmatter.title,
      subtitulo: frontmatter.subtitle ?? null,
      status: validStatus(frontmatter.status, file.path),
      order: frontmatter.order,
      body: document,
      tabs: [],
    };
    pageOrigins.set(page, file.path);
    return page;
  }

  function pageFromFolder(folder: PageFolder): PageNode | null {
    if (!folder.index) {
      structural(folder.path, `a pasta da página "${folder.name}" precisa de um index.mdx (o corpo da página).`);
      for (const tab of folder.tabs) read(tab, 'tab'); // ainda reporta problemas das tabs
      return null;
    }
    const page = pageFromFile(folder.index);
    const tabs: TabNode[] = [];
    for (const file of folder.tabs) {
      const { frontmatter, document } = read(file, 'tab');
      if (!frontmatter) continue;
      const slug = frontmatter.slug ?? splitName(file.path.split('/').pop()!).base;
      if (!SLUG.test(slug)) {
        structural(file.path, `nome de arquivo "${slug}" não é um slug válido — renomeie (minúsculas, dígitos e hífens) ou defina "slug" no frontmatter.`);
        continue;
      }
      if (slug === 'index') {
        structural(file.path, '"index" é reservado ao corpo da página — escolha outro slug para a tab.');
        continue;
      }
      tabs.push({ ...document, slug, titulo: frontmatter.title, order: frontmatter.order });
    }
    if (!page) return null;
    // O slug da pasta manda, a menos que o index o sobrescreva.
    const indexSlug = page.slug === 'index' ? folder.name : page.slug;
    if (!SLUG.test(indexSlug)) {
      structural(folder.path, `nome de pasta "${folder.name}" não é um slug válido — renomeie ou defina "slug" no frontmatter do index.`);
      return null;
    }
    page.slug = indexSlug;
    pageOrigins.set(page, folder.path);
    page.tabs = checkDuplicates(tabs.sort(byOrder), (t) => t.file, 'tab');
    return page;
  }

  // ---- 4. Monta seções e menus ----
  const menuNodes: MenuNode[] = [];
  const menuOrigins = new WeakMap<MenuNode, string>();
  for (const menu of menus.values()) {
    const menuSlug = folderSlug(menu, 'menu', `${menu.path}/_menu.yml`);
    const sectionNodes: SectionNode[] = [];
    const sectionOrigins = new WeakMap<SectionNode, string>();

    for (const section of [...sections.values()].filter((s) => s.path.startsWith(`${menu.path}/`))) {
      const sectionSlug = folderSlug(section, 'seção', `${section.path}/_section.yml`);
      const pages = [
        ...(pageFiles.get(section.path) ?? []).map(pageFromFile),
        ...[...pageFolders.values()].filter((f) => f.path.startsWith(`${section.path}/`)).map(pageFromFolder),
      ].filter((p): p is PageNode => p !== null);
      if (!sectionSlug || !pages.length) continue;
      const node: SectionNode = {
        slug: sectionSlug,
        titulo: section.meta?.title ?? humanize(sectionSlug),
        order: section.meta?.order,
        pages: checkDuplicates(pages.sort(byOrder), (p) => pageOrigins.get(p)!, 'página'),
      };
      sectionOrigins.set(node, section.path);
      sectionNodes.push(node);
    }

    if (!menuSlug || !sectionNodes.length) continue;
    const node: MenuNode = {
      slug: menuSlug,
      titulo: menu.meta?.title ?? humanize(menuSlug),
      order: menu.meta?.order,
      sections: checkDuplicates(sectionNodes.sort(byOrder), (s) => sectionOrigins.get(s)!, 'seção'),
    };
    menuOrigins.set(node, menu.path);
    menuNodes.push(node);
  }

  // ---- 5. Landing ----
  let landing: LandingNode | null = null;
  if (landingFile) {
    const { frontmatter, document } = read(landingFile, 'landing');
    landing = { ...document, titulo: frontmatter?.title ?? null };
  }

  return {
    landing,
    menus: checkDuplicates(menuNodes.sort(byOrder), (m) => menuOrigins.get(m)!, 'menu'),
    diagnostics,
  };
}
