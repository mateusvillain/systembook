import { DiagnosticBag, type Diagnostic } from '../diagnostics.js';
import {
  FOLDER_TRANSLATION_UNKNOWN,
  folderTranslationSchema,
  readYamlFields,
  type FolderTranslation,
  type FrontmatterFor,
} from '../frontmatter.js';
import { parseDocument } from '../parse/index.js';
import { CONTENT_FILE, isIgnored, META_FILES, normalizePath, splitName, uppercaseExtension } from './paths.js';
import type {
  ContentDocument,
  ContentFile,
  ContentTree,
  LandingNode,
  LocaleMenuNode,
  LocalePageNode,
  LocaleSectionNode,
  LocaleTabNode,
  LocaleTree,
  PageNode,
  TabNode,
} from './types.js';

/**
 * Lê a pasta de um idioma de tradução (SYS-164). A pasta espelha o diretório
 * de conteúdo só com os arquivos traduzidos: cada arquivo casa com a página,
 * tab, landing, menu ou seção do original **pelo caminho** (sem a extensão —
 * `p.md` traduz `p.mdx`). A estrutura (existência, ordem, status) vem sempre
 * da árvore base; a tradução só traz textos, slugs e o corpo.
 *
 * Nada some em silêncio: arquivo ou pasta sem par no original, campo de
 * estrutura (`order`, `status`) e slug repetido no mesmo nível viram
 * diagnóstico. Puro, como `buildContentTree`: recebe os arquivos já lidos
 * (`readContentDir(dir)`), com caminhos relativos à pasta do idioma.
 */

/** Caminho sem a extensão do arquivo — a chave que casa tradução e original. */
function stem(path: string): string {
  return path.replace(CONTENT_FILE, '');
}

type Target =
  | { kind: 'landing'; node: LandingNode }
  | { kind: 'page'; node: PageNode }
  | { kind: 'tab'; node: TabNode };

/** Papel do original → frontmatter aceito na tradução. */
const TRANSLATION_KIND = { landing: 'landing', page: 'pageTranslation', tab: 'tabTranslation' } as const;

/** Linha do campo `slug:` no frontmatter (`.md`/`.mdx`) ou no `.yml`, para o `arquivo:linha`. */
function slugLine(source: string, yml: boolean): number {
  const lines = source.split('\n');
  if (yml) {
    const i = lines.findIndex((line) => /^slug\s*:/.test(line));
    return i < 0 ? 1 : i + 1;
  }
  if (lines[0]?.trim() !== '---') return 1;
  for (let i = 1; i < lines.length && lines[i]!.trim() !== '---'; i++) {
    if (/^slug\s*:/.test(lines[i]!)) return i + 1;
  }
  return 1;
}

interface Translated<K extends keyof typeof TRANSLATION_KIND> {
  file: ContentFile;
  document: ContentDocument;
  frontmatter: FrontmatterFor<(typeof TRANSLATION_KIND)[K]> | null;
}

/** Item de um nível da árvore, para a checagem de slug repetido. */
interface SlugEntry {
  slug: string;
  /** Arquivo traduzido que mudou o slug (`null` = slug do original, mesmo se repetido no frontmatter). */
  file: ContentFile | null;
  yml: boolean;
  /** Onde está o original, para a mensagem. */
  origin: string;
}

export function buildLocaleTree(base: ContentTree, files: readonly ContentFile[]): LocaleTree {
  const diagnostics: Diagnostic[] = [];
  const report = (file: string, message: string, line = 1) => diagnostics.push({ file, line, column: 1, message });

  // ---- o que existe no original ----
  const targets = new Map<string, Target>();
  const menuPaths = new Set<string>();
  const sectionPaths = new Set<string>();
  if (base.landing) targets.set(stem(base.landing.file), { kind: 'landing', node: base.landing });
  for (const menu of base.menus) {
    menuPaths.add(menu.path);
    for (const section of menu.sections) {
      sectionPaths.add(section.path);
      for (const page of section.pages) {
        targets.set(stem(page.body.file), { kind: 'page', node: page });
        for (const tab of page.tabs) targets.set(stem(tab.file), { kind: 'tab', node: tab });
      }
    }
  }

  // ---- casar cada arquivo da tradução ----
  const documents = new Map<string, ContentFile>();
  const metas = new Map<string, ContentFile>();
  const orphanFolders = new Set<string>();

  /** Primeira pasta do caminho sem par no original (relatada uma vez só). */
  function missingFolder(segments: string[]): boolean {
    const checks: [string, Set<string>][] = [
      [segments[0]!, menuPaths],
      [segments.slice(0, 2).join('/'), sectionPaths],
    ];
    for (const [depth, [folder, known]] of checks.entries()) {
      if (segments.length - 1 <= depth) return false; // o arquivo está nesta pasta, não dentro dela
      if (known.has(folder)) continue;
      if (!orphanFolders.has(folder)) {
        orphanFolders.add(folder);
        report(`${folder}/`, `pasta "${folder}" sem par no conteúdo original — a tradução espelha os caminhos do idioma padrão.`);
      }
      return true;
    }
    return false;
  }

  const normalized = files
    .map((file) => ({ ...file, path: normalizePath(file.path) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of normalized) {
    const segments = file.path.split('/');
    if (isIgnored(segments)) continue;
    const name = segments[segments.length - 1]!;

    if ((META_FILES as readonly string[]).includes(name)) {
      if (segments.length !== (name === '_menu.yml' ? 2 : 3)) {
        const where = name === '_menu.yml' ? 'na pasta do menu (menu/_menu.yml)' : 'na pasta da seção (menu/seção/_section.yml)';
        report(file.path, `${name} fora do lugar — ele fica ${where}.`);
      } else if (!missingFolder(segments)) metas.set(segments.slice(0, -1).join('/'), file);
      continue;
    }

    if (!CONTENT_FILE.test(name)) {
      const uppercase = uppercaseExtension(name);
      if (uppercase) report(file.path, uppercase);
      continue; // imagens e outros arquivos ficam no disco
    }

    if (missingFolder(segments)) continue;
    const key = stem(file.path);
    if (!targets.has(key)) {
      report(file.path, 'arquivo sem par no conteúdo original — a tradução precisa estar no mesmo caminho da página, tab ou landing que traduz.');
      continue;
    }
    const first = documents.get(key);
    if (first) {
      report(file.path, `a tradução deste arquivo já está em ${first.path} — deixe só uma.`);
      continue;
    }
    documents.set(key, file);
  }

  // ---- ler ----
  function read<K extends keyof typeof TRANSLATION_KIND>(original: string, kind: K): Translated<K> | null {
    const file = documents.get(stem(original));
    if (!file) return null;
    const parsed = parseDocument(file.source, { file: file.path, format: splitName(file.path).format, kind: TRANSLATION_KIND[kind] });
    diagnostics.push(...parsed.diagnostics);
    return {
      file,
      document: { file: file.path, doc: parsed.doc, references: parsed.references },
      frontmatter: parsed.frontmatter as FrontmatterFor<(typeof TRANSLATION_KIND)[K]> | null,
    };
  }

  function readMeta(folder: string): { file: ContentFile; meta: FolderTranslation | null } | null {
    const file = metas.get(folder);
    if (!file) return null;
    const bag = new DiagnosticBag(file.path);
    const meta = readYamlFields(file.source, {
      schema: folderTranslationSchema,
      firstLine: 1,
      at: { line: 1, column: 1 },
      prefix: '',
      unknownWhere: FOLDER_TRANSLATION_UNKNOWN,
      bag,
    });
    diagnostics.push(...bag.items);
    return { file, meta };
  }

  /** Slug repetido no mesmo nível, já com as traduções: erro no arquivo que trouxe o slug. */
  function checkUnique(entries: SlugEntry[], what: string): void {
    const seen = new Map<string, SlugEntry>();
    for (const entry of entries) {
      const first = seen.get(entry.slug);
      if (!first) {
        seen.set(entry.slug, entry);
        continue;
      }
      // No original os slugs do nível são únicos, então ao menos um dos dois mudou o slug.
      const [culprit, other] = entry.file ? [entry, first] : [first, entry];
      const where = other.file ? `por ${other.file.path}` : `pelo original ${other.origin}`;
      report(
        culprit.file!.path,
        `${what} com slug "${entry.slug}" repetido neste idioma (já usado ${where}).`,
        slugLine(culprit.file!.source, culprit.yml),
      );
    }
  }

  function tabNode(tab: TabNode): LocaleTabNode & { entry: SlugEntry } {
    const translated = read(tab.file, 'tab');
    const fm = translated?.frontmatter;
    let slug = fm?.slug ?? tab.slug;
    if (fm?.slug === 'index') {
      report(translated!.file.path, '"index" é reservado ao corpo da página — escolha outro slug para a tab.', slugLine(translated!.file.source, false));
      slug = tab.slug;
    }
    return {
      base: tab,
      slug,
      titulo: fm?.title ?? tab.titulo,
      document: fm ? translated.document : null,
      entry: { slug, file: slug !== tab.slug ? translated!.file : null, yml: false, origin: tab.file },
    };
  }

  function pageNode(page: PageNode): LocalePageNode & { entry: SlugEntry } {
    const translated = read(page.body.file, 'page');
    const fm = translated?.frontmatter;
    const tabs = page.tabs.map(tabNode);
    checkUnique(tabs.map((t) => t.entry), 'tab');
    const slug = fm?.slug ?? page.slug;
    return {
      base: page,
      slug,
      titulo: fm?.title ?? page.titulo,
      subtitulo: fm?.subtitle ?? page.subtitulo,
      overviewTitulo: fm?.overviewTitle ?? page.overviewTitulo,
      body: fm ? translated.document : null,
      tabs: tabs.map(({ entry: _entry, ...tab }) => tab),
      entry: { slug, file: slug !== page.slug ? translated!.file : null, yml: false, origin: page.body.file },
    };
  }

  const menus = base.menus.map((menu): LocaleMenuNode & { entry: SlugEntry } => {
    const sections = menu.sections.map((section): LocaleSectionNode & { entry: SlugEntry } => {
      const pages = section.pages.map(pageNode);
      checkUnique(pages.map((p) => p.entry), 'página');
      const meta = readMeta(section.path);
      const slug = meta?.meta?.slug ?? section.slug;
      return {
        base: section,
        slug,
        titulo: meta?.meta?.title ?? section.titulo,
        translated: meta?.meta != null,
        pages: pages.map(({ entry: _entry, ...page }) => page),
        entry: { slug, file: slug !== section.slug ? meta!.file : null, yml: true, origin: `${section.path}/` },
      };
    });
    checkUnique(sections.map((s) => s.entry), 'seção');
    const meta = readMeta(menu.path);
    const slug = meta?.meta?.slug ?? menu.slug;
    return {
      base: menu,
      slug,
      titulo: meta?.meta?.title ?? menu.titulo,
      translated: meta?.meta != null,
      sections: sections.map(({ entry: _entry, ...section }) => section),
      entry: { slug, file: slug !== menu.slug ? meta!.file : null, yml: true, origin: `${menu.path}/` },
    };
  });
  checkUnique(menus.map((m) => m.entry), 'menu');

  let landing: LandingNode | null = null;
  if (base.landing) {
    const translated = read(base.landing.file, 'landing');
    if (translated?.frontmatter) {
      landing = { ...translated.document, titulo: translated.frontmatter.title ?? base.landing.titulo };
    }
  }

  return {
    landing,
    menus: menus.map(({ entry: _entry, ...menu }) => menu),
    diagnostics,
  };
}
