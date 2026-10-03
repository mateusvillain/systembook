import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { blocksToTiptapDoc, serializeDocument, SLUG_PATTERN, type TiptapDoc, type TiptapNode } from '@systembook/content';
import type { Block, ExportedFile, InstanceExport, PageSnapshot } from '@systembook/schema';

/**
 * Do payload de `migration.export` (SYS-110) para os arquivos de um projeto do
 * modo estático (SYS-111). Função pura: quem chama baixa e escreve. O
 * formato de destino é o de `docs/static-format.md`, e o resultado tem que
 * passar no `check` — o que o CMS aceita e o formato não é ajustado aqui, com
 * aviso.
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
  /** `arquivo: mensagem` — o que precisou ser ajustado ou não foi resolvido. */
  warnings: string[];
  pages: number;
}

export interface BuildExportOptions {
  /** URL da instância: links e imagens dela são do próprio conteúdo. */
  origin: string;
  /** URLs de imagem que não puderam ser baixadas: ficam apontando para a instância. */
  failedDownloads?: ReadonlySet<string>;
}

/** Normalização de slug do CMS (`slugify` do server): sem acento, minúsculas, hífens. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Primeiro livre de `base`, `base-2`, `base-3`… (e registra o escolhido). */
function unique(base: string, used: Set<string>): string {
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}-${n}`;
  used.add(candidate);
  return candidate;
}

const LOGO_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };

type Tab = PageSnapshot['tabs'][number];

interface PlannedPage {
  body: { file: string; blocks: Block[] };
  tabs: { file: string; title: string; blocks: Block[] }[];
  frontmatter: Record<string, unknown>;
}

/** Endereço do CMS (`menu/seção/página[/tabId]`, ou sem o menu) → arquivo do projeto. */
type AddressBook = Map<string, string>;

/**
 * 1ª passada: o caminho de cada menu, seção, página e tab, já com slugs
 * válidos e únicos, e os endereços do CMS que levam a cada arquivo.
 */
function planTree(data: InstanceExport, warn: (message: string) => void) {
  const files: ProjectFile[] = [];
  const pages: PlannedPage[] = [];
  const addresses: AddressBook = new Map();

  /** Título que o formato aceita (não vazio depois do trim). */
  const title = (value: string, fallback: string, where: string) => {
    if (value.trim()) return value;
    warn(`${where}: título em branco virou "${fallback}" — o formato de arquivo exige um título.`);
    return fallback;
  };
  /** Slug do CMS validado contra o formato e único no seu nível. */
  const slug = (value: string, name: string, used: Set<string>, where: string) => {
    let base = value;
    if (!SLUG_PATTERN.test(base)) {
      base = slugify(value) || slugify(name) || 'item';
      warn(`${where}: o slug "${value}" não é válido no formato de arquivo e virou "${base}" — a URL muda.`);
    }
    const chosen = unique(base, used);
    if (chosen !== base) warn(`${where}: o slug "${base}" repetiu no mesmo nível e virou "${chosen}" — a URL muda.`);
    return chosen;
  };

  const tags = new Set(data.settings.statusTags.map((tag) => tag.titulo.trim()).filter(Boolean));
  const menuSlugs = new Set<string>();
  // Menus e seções sem página publicada não aparecem na doc — nem viram pasta.
  // `order` é a posição: o CMS desempata `ordem` igual pelo id, o arquivo pelo slug.
  data.menus
    .filter((menu) => menu.sections.some((s) => s.pages.length))
    .forEach((menu, menuOrder) => {
      const where = `menu "${menu.titulo}"`;
      const menuSlug = slug(menu.slug, menu.titulo, menuSlugs, where);
      const menuDir = `${CONTENT_DIR}/${menuSlug}`;
      files.push({ path: `${menuDir}/_menu.yml`, content: yaml({ title: title(menu.titulo, menuSlug, where), order: menuOrder }) });
      const sectionSlugs = new Set<string>();
      menu.sections
        .filter((section) => section.pages.length)
        .forEach((section, sectionOrder) => {
          const where = `seção "${section.titulo}"`;
          const dir = `${menuDir}/${slug(section.slug, section.titulo, sectionSlugs, where)}`;
          files.push({ path: `${dir}/_section.yml`, content: yaml({ title: title(section.titulo, 'Seção', where), order: sectionOrder }) });
          const pageSlugs = new Set<string>();
          section.pages.forEach((page, pageOrder) => {
            const where = `página "${page.titulo}"`;
            const pageSlug = slug(page.slug, page.titulo, pageSlugs, where);
            let primary = page.snapshot.tabs.find((tab) => tab.isPrimary);
            let userTabs = page.snapshot.tabs.filter((tab) => !tab.isPrimary);
            if (!primary && userTabs.length) {
              // Revisão anterior ao corpo de página: no CMS a 1ª tab abre a
              // página. Ela vira o corpo — o conteúdo aparece primeiro igual,
              // mas com o rótulo "Overview".
              [primary, ...userTabs] = userTabs as [Tab, ...Tab[]];
              warn(`${where}: a revisão publicada não tem corpo de página; a tab "${primary.titulo}" virou o Overview.`);
            }
            // `index` solto numa seção é erro no formato: com o slug `index`, a
            // página usa sempre a forma de pasta.
            const folder = userTabs.length > 0 || pageSlug === 'index';
            const body = folder ? `${dir}/${pageSlug}/index.mdx` : `${dir}/${pageSlug}.mdx`;
            const tabSlugs = new Set(['index']);
            const tabs = userTabs.map((tab, i) => {
              const tabTitle = title(tab.titulo, `Tab ${i + 1}`, `${where}, tab ${i + 1}`);
              const file = `${dir}/${pageSlug}/${unique(slugify(tabTitle) || 'tab', tabSlugs)}.mdx`;
              return { file, title: tabTitle, blocks: tab.blocks, tabId: tab.tabId };
            });

            const status = page.status && tags.has(page.status.trim()) ? page.status.trim() : null;
            pages.push({
              body: { file: body, blocks: primary?.blocks ?? [] },
              tabs,
              frontmatter: { title: title(page.titulo, 'Página', where), subtitle: page.subtitulo, order: pageOrder, status },
            });

            const key = `${menu.slug}/${section.slug}/${page.slug}`;
            addresses.set(key, body);
            addresses.set(`${section.slug}/${page.slug}`, body);
            if (primary) addresses.set(`${key}/${primary.tabId}`, body);
            for (const tab of tabs) addresses.set(`${key}/${tab.tabId}`, tab.file);
          });
        });
    });
  return { files, pages, addresses };
}

/**
 * Reescreve os endereços da própria instância num doc: links para páginas
 * viram o caminho relativo do `.mdx`; imagens viram o arquivo baixado (ou,
 * se o download falhou, a URL absoluta da instância).
 */
function createRewriter(options: {
  origin: string;
  addresses: AddressBook;
  landingFile: string | null;
  failedDownloads: ReadonlySet<string>;
  warn: (message: string) => void;
}) {
  const imagePaths = new Map<string, string>();
  const downloads: ImageDownload[] = [];

  /** Caminho na instância (`/…`) de uma URL dela; `null` se for de fora. */
  const ownPath = (url: string): string | null => {
    if (!url.startsWith('/') && !/^https?:\/\//i.test(url)) return null;
    try {
      const parsed = new URL(url, options.origin);
      if (parsed.origin !== options.origin || url.startsWith('//')) return null;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return null;
    }
  };

  const imageFile = (own: string) => {
    let local = imagePaths.get(own);
    if (!local) {
      const name = path.posix.basename(own.split(/[?#]/)[0]!);
      const rawExt = path.posix.extname(name);
      // Extensão só com letras e dígitos: o nome vem do servidor.
      const ext = /^\.[a-z0-9]+$/i.test(rawExt) ? rawExt.toLowerCase() : '';
      const stem = slugify(name.slice(0, name.length - rawExt.length)) || 'imagem';
      const taken = new Set([...imagePaths.values()].map((p) => path.posix.basename(p, path.posix.extname(p))));
      local = `${IMAGES_DIR}/${unique(stem, taken)}${ext}`;
      imagePaths.set(own, local);
      downloads.push({ url: `${options.origin}${own}`, path: local });
    }
    return local;
  };

  const rewrite = (doc: TiptapDoc, file: string): TiptapDoc => {
    const relative = (target: string) => {
      const rel = path.posix.relative(path.posix.dirname(file), target);
      return rel.startsWith('.') ? rel : `./${rel}`;
    };
    const href = (value: string): string => {
      const own = ownPath(value);
      if (own === null || value.startsWith('#')) return value;
      const [pathname = '', hash] = own.split('#', 2) as [string, string | undefined];
      const segments = pathname.split('?')[0]!.split('/').filter(Boolean);
      if (segments[0] !== 'docs') return value;
      const rest = segments.slice(1).join('/');
      const target = rest ? options.addresses.get(rest) : options.landingFile;
      if (!target) {
        options.warn(`${file}: o link "${value}" aponta para uma página que não foi exportada (nunca publicada ou removida) e ficou como está.`);
        return value;
      }
      return `${relative(target)}${hash ? `#${hash}` : ''}`;
    };
    const src = (value: string): string => {
      const own = ownPath(value);
      if (own === null) return value;
      const url = `${options.origin}${own}`;
      return options.failedDownloads.has(url) ? url : relative(imageFile(own));
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

  return { rewrite, downloads };
}

export function buildExportProject(data: InstanceExport, options: BuildExportOptions): ExportProject {
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(message);
  const origin = new URL(options.origin).origin;
  const tree = planTree(data, warn);
  const landingFile = data.landing ? `${CONTENT_DIR}/index.mdx` : null;
  const { rewrite, downloads } = createRewriter({
    origin,
    addresses: tree.addresses,
    landingFile,
    failedDownloads: options.failedDownloads ?? new Set(),
    warn,
  });

  const files: ProjectFile[] = [];
  const write = (file: string, blocks: Block[], frontmatter: Record<string, unknown> | null) => {
    const { source, warnings: lost } = serializeDocument(rewrite(blocksToTiptapDoc(blocks), file), { frontmatter });
    for (const message of lost) warn(`${file}: ${message}`);
    files.push({ path: file, content: source });
  };

  if (landingFile && data.landing) {
    const body = data.landing.tabs.find((tab) => tab.isPrimary) ?? data.landing.tabs[0];
    write(landingFile, body?.blocks ?? [], null);
  }
  files.push(...tree.files);
  for (const page of tree.pages) {
    write(page.body.file, page.body.blocks, page.frontmatter);
    page.tabs.forEach((tab, order) => write(tab.file, tab.blocks, { title: tab.title, order }));
  }
  files.push(...configFiles(data, options.origin, warn));

  return { files, downloads, warnings, pages: tree.pages.length };
}

/** `systembook.config.ts` e os logos em `brand/`. */
function configFiles(data: InstanceExport, origin: string, warn: (message: string) => void): ProjectFile[] {
  const files: ProjectFile[] = [];
  const logo = (file: ExportedFile | null, name: string) => {
    if (!file) return null;
    const logoPath = `brand/${name}.${LOGO_EXTENSIONS[file.mime] ?? 'bin'}`;
    files.push({ path: logoPath, content: Buffer.from(file.base64, 'base64') });
    return `./${logoPath}`;
  };
  let name = data.settings.nome;
  if (!name.trim()) {
    name = 'Documentation';
    warn(`systembook.config.ts: o nome da instância está em branco e virou "${name}".`);
  }
  // Tag em branco ou repetida não passa na config; a 1ª de cada nome fica.
  const seen = new Set<string>();
  const statusTags = data.settings.statusTags.filter((tag) => {
    const key = tag.titulo.trim();
    if (!key || seen.has(key)) {
      warn(`systembook.config.ts: a status tag "${tag.titulo}" ficou de fora (${key ? 'nome repetido' : 'nome em branco'}).`);
      return false;
    }
    seen.add(key);
    return true;
  });

  const lines = [
    `import type { SystemBookConfig } from '@systembook/cli';`,
    '',
    `// Exportado de ${origin} pelo \`systembook export\`.`,
    '// Formato completo: https://github.com/mateusvillain/systembook/blob/main/docs/static-format.md',
    'export default {',
    `  name: ${JSON.stringify(name)},`,
  ];
  const light = logo(data.settings.logo, 'logo');
  const dark = logo(data.settings.logoDark, 'logo-dark');
  if (light) lines.push(`  logo: ${JSON.stringify(light)},`);
  if (dark) lines.push(`  logoDark: ${JSON.stringify(dark)},`);
  if (statusTags.length) {
    lines.push('  statusTags: [');
    for (const tag of statusTags) lines.push(`    { titulo: ${JSON.stringify(tag.titulo.trim())}, cor: ${JSON.stringify(tag.cor)} },`);
    lines.push('  ],');
  }
  lines.push('} satisfies SystemBookConfig;', '');
  files.push({ path: 'systembook.config.ts', content: lines.join('\n') });
  return files;
}

function yaml(value: Record<string, unknown>): string {
  return stringifyYaml(value, { lineWidth: 0 });
}
