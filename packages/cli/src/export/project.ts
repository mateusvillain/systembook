import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { blocksToTiptapDoc, serializeDocument, SLUG_PATTERN, type TiptapDoc, type TiptapNode } from '@systembook/content';
import type { ExportedFile, ExportedPage, InstanceExport, PageSnapshot } from '@systembook/schema';

/**
 * Do payload de `migration.export` (SYS-110) para os arquivos de um projeto do
 * modo estático (SYS-111). Função pura: quem chama baixa e escreve. O
 * formato de destino é o de `docs/static-format.md`.
 */

export const CONTENT_DIR = 'docs';
/** Imagens da instância baixadas para dentro do conteúdo (pasta com `_` não vira menu). */
export const IMAGES_DIR = `${CONTENT_DIR}/_images`;

export interface ProjectFile {
  /** Relativo à raiz do projeto, com `/`. */
  path: string;
  content: string | Buffer;
}

/** Imagem hospedada na própria instância: o export a baixa para `path`. */
export interface ImageDownload {
  url: string;
  path: string;
}

export interface ExportProject {
  files: ProjectFile[];
  downloads: ImageDownload[];
  /** `arquivo: mensagem` — o que precisou ser simplificado ou não foi resolvido. */
  warnings: string[];
  pages: number;
}

/** Normalização de slug do CMS (`slugify` do server): sem acento, minúsculas, hífens. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const LOGO_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };

/** Onde cada página e tab do CMS foi parar, para reescrever os links internos. */
interface Target {
  file: string;
}

export function buildExportProject(data: InstanceExport, options: { origin: string }): ExportProject {
  const files: ProjectFile[] = [];
  const downloads: ImageDownload[] = [];
  const warnings: string[] = [];
  const origin = new URL(options.origin).origin;
  let pages = 0;

  /** Slug do CMS validado contra o formato de arquivo. */
  const safeSlug = (slug: string, title: string, where: string) => {
    if (SLUG_PATTERN.test(slug)) return slug;
    const fixed = slugify(slug) || slugify(title) || 'item';
    warnings.push(`${where}: o slug "${slug}" não é válido no formato de arquivo e virou "${fixed}" — a URL muda.`);
    return fixed;
  };

  // ---- 1ª passada: o arquivo de cada página e tab ----
  const targets = new Map<string, Target>();
  const legacy = new Map<string, Target>();
  type Planned = { page: ExportedPage; dir: string; body: string; tabs: { file: string; title: string; tab: PageSnapshot['tabs'][number] }[] };
  const planned: Planned[] = [];
  const menuFiles: ProjectFile[] = [];

  for (const menu of data.menus) {
    const menuPages = menu.sections.flatMap((s) => s.pages);
    if (!menuPages.length) continue; // menu sem página publicada não aparece na doc
    const menuSlug = safeSlug(menu.slug, menu.titulo, `menu "${menu.titulo}"`);
    menuFiles.push({ path: `${CONTENT_DIR}/${menuSlug}/_menu.yml`, content: yaml({ title: menu.titulo, order: menu.ordem }) });
    for (const section of menu.sections) {
      if (!section.pages.length) continue;
      const sectionSlug = safeSlug(section.slug, section.titulo, `seção "${section.titulo}"`);
      const dir = `${CONTENT_DIR}/${menuSlug}/${sectionSlug}`;
      menuFiles.push({ path: `${dir}/_section.yml`, content: yaml({ title: section.titulo, order: section.ordem }) });
      for (const page of section.pages) {
        const pageSlug = safeSlug(page.slug, page.titulo, `página "${page.titulo}"`);
        const userTabs = page.snapshot.tabs.filter((tab) => !tab.isPrimary);
        const body = userTabs.length ? `${dir}/${pageSlug}/index.mdx` : `${dir}/${pageSlug}.mdx`;
        const used = new Set(['index']);
        const tabs = userTabs.map((tab) => {
          let slug = slugify(tab.titulo) || 'tab';
          for (let n = 2; used.has(slug); n++) slug = `${slugify(tab.titulo) || 'tab'}-${n}`;
          used.add(slug);
          return { file: `${dir}/${pageSlug}/${slug}.mdx`, title: tab.titulo, tab };
        });
        planned.push({ page, dir, body, tabs });
        // Endereços do CMS (`/docs/menu/seção/página[/tabId]`) e o legado sem menu.
        const key = `${menu.slug}/${section.slug}/${page.slug}`;
        targets.set(key, { file: body });
        legacy.set(`${section.slug}/${page.slug}`, { file: body });
        for (const { file, tab } of tabs) targets.set(`${key}/${tab.tabId}`, { file });
        const primary = page.snapshot.tabs.find((tab) => tab.isPrimary);
        if (primary) targets.set(`${key}/${primary.tabId}`, { file: body });
      }
    }
  }
  const landingFile = data.landing ? `${CONTENT_DIR}/index.mdx` : null;

  // ---- links e imagens: endereço do CMS → arquivo do projeto ----
  const imagePaths = new Map<string, string>();
  const rewrite = (doc: TiptapDoc, file: string): TiptapDoc => {
    const relative = (target: string) => {
      const rel = path.posix.relative(path.posix.dirname(file), target);
      return rel.startsWith('.') ? rel : `./${rel}`;
    };
    const ownPath = (url: string): string | null => {
      if (url.startsWith('/') && !url.startsWith('//')) return url;
      try {
        const parsed = new URL(url);
        return parsed.origin === origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null;
      } catch {
        return null;
      }
    };
    const href = (value: string): string => {
      const own = ownPath(value);
      if (own === null) return value;
      const [pathname = '', hash] = own.split('#', 2) as [string, string | undefined];
      const segments = pathname.split('?')[0]!.split('/').filter(Boolean);
      if (segments[0] !== 'docs') return value;
      const rest = segments.slice(1).join('/');
      const target = rest ? (targets.get(rest) ?? legacy.get(rest))?.file : landingFile;
      if (!target) {
        warnings.push(`${file}: o link "${value}" aponta para uma página que não foi exportada (nunca publicada ou removida) e ficou como está.`);
        return value;
      }
      return `${relative(target)}${hash ? `#${hash}` : ''}`;
    };
    const src = (value: string): string => {
      const own = ownPath(value);
      if (own === null) return value;
      let local = imagePaths.get(own);
      if (!local) {
        const name = path.posix.basename(own.split(/[?#]/)[0]!) || 'imagem';
        const ext = path.posix.extname(name);
        const stem = slugify(name.slice(0, name.length - ext.length)) || 'imagem';
        local = `${IMAGES_DIR}/${stem}${ext.toLowerCase()}`;
        for (let n = 2; [...imagePaths.values()].includes(local); n++) local = `${IMAGES_DIR}/${stem}-${n}${ext.toLowerCase()}`;
        imagePaths.set(own, local);
        downloads.push({ url: `${origin}${own}`, path: local });
      }
      return relative(local);
    };
    const walk = (node: TiptapNode): TiptapNode => {
      const next: TiptapNode = { ...node };
      if (node.marks) {
        next.marks = node.marks.map((mark) => {
          const m = mark as { type: string; attrs?: Record<string, unknown> };
          return m.type === 'link' && typeof m.attrs?.href === 'string' ? { ...m, attrs: { ...m.attrs, href: href(m.attrs.href) } } : m;
        });
      }
      if (node.type === 'image' && typeof node.attrs?.src === 'string') next.attrs = { ...node.attrs, src: src(node.attrs.src) };
      const cover = node.attrs?.cover as { kind?: string; src?: string } | null | undefined;
      if (node.type === 'dosDonts' && cover?.kind === 'image' && cover.src) {
        next.attrs = { ...node.attrs, cover: { ...cover, src: src(cover.src) } };
      }
      if (node.content) next.content = node.content.map(walk);
      return next;
    };
    return { type: 'doc', content: (doc.content ?? []).map(walk) };
  };

  const write = (file: string, blocks: PageSnapshot['tabs'][number]['blocks'] | null, frontmatter: Record<string, unknown> | null) => {
    const doc = rewrite(blocksToTiptapDoc(blocks ?? []), file);
    const { source, warnings: lost } = serializeDocument(doc, { frontmatter });
    for (const message of lost) warnings.push(`${file}: ${message}`);
    files.push({ path: file, content: source });
  };

  // ---- 2ª passada: os arquivos ----
  if (landingFile && data.landing) {
    const body = data.landing.tabs.find((tab) => tab.isPrimary) ?? data.landing.tabs[0];
    write(landingFile, body?.blocks ?? [], null);
  }
  files.push(...menuFiles);
  for (const { page, body, tabs } of planned) {
    pages++;
    const primary = page.snapshot.tabs.find((tab) => tab.isPrimary);
    if (!primary) {
      warnings.push(`${body}: a revisão publicada é anterior ao corpo de página (sem tab primária) — o Overview fica vazio e o conteúdo segue nas tabs.`);
    }
    write(body, primary?.blocks ?? [], {
      title: page.titulo,
      subtitle: page.subtitulo,
      order: page.ordem,
      status: page.status,
    });
    tabs.forEach(({ file, title, tab }, order) => write(file, tab.blocks, { title, order }));
  }

  // ---- config e logos ----
  const logo = (file: ExportedFile | null, name: string) => {
    if (!file) return null;
    const ext = LOGO_EXTENSIONS[file.mime] ?? 'bin';
    const logoPath = `brand/${name}.${ext}`;
    files.push({ path: logoPath, content: Buffer.from(file.base64, 'base64') });
    return `./${logoPath}`;
  };
  const config = {
    name: data.settings.nome,
    logo: logo(data.settings.logo, 'logo'),
    logoDark: logo(data.settings.logoDark, 'logo-dark'),
    statusTags: data.settings.statusTags,
  };
  files.push({ path: 'systembook.config.ts', content: configSource(config, options.origin) });

  return { files, downloads, warnings, pages };
}

function yaml(value: Record<string, unknown>): string {
  return stringifyYaml(value, { lineWidth: 0 });
}

function configSource(
  config: { name: string; logo: string | null; logoDark: string | null; statusTags: { titulo: string; cor: string }[] },
  origin: string,
): string {
  const lines = [
    `import type { SystemBookConfig } from '@systembook/cli';`,
    '',
    `// Exportado de ${origin} pelo \`systembook export\`.`,
    '// Formato completo: https://github.com/mateusvillain/systembook/blob/main/docs/static-format.md',
    'export default {',
    `  name: ${JSON.stringify(config.name)},`,
  ];
  if (config.logo) lines.push(`  logo: ${JSON.stringify(config.logo)},`);
  if (config.logoDark) lines.push(`  logoDark: ${JSON.stringify(config.logoDark)},`);
  if (config.statusTags.length) {
    lines.push('  statusTags: [');
    for (const tag of config.statusTags) lines.push(`    { titulo: ${JSON.stringify(tag.titulo)}, cor: ${JSON.stringify(tag.cor)} },`);
    lines.push('  ],');
  }
  lines.push('} satisfies SystemBookConfig;', '');
  return lines.join('\n');
}
