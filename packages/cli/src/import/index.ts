import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blocksToTiptapDoc, buildSiteData, pageKey, type TiptapDoc } from '@systembook/content';
import type { ExportedFile, ImportedImage, ImportResult, InstanceImport, PageSnapshot } from '@systembook/schema';
import { prepareSite } from '../build/prepare.js';
import type { ResolvedConfig } from '../config.js';

export interface ImportOptions {
  /** URL da instância CMS (`https://docs.acme.dev`). */
  to: string;
  /** Token de escopo `migration` (gerado em Settings → Tokens). */
  token: string;
  /** Substitui páginas (e a landing) que já existem na instância. */
  overwrite?: boolean;
  /** Injetável nos testes. */
  fetch?: typeof fetch;
}

export interface ImportOutcome extends ImportResult {
  warnings: string[];
}

/** Erro de uso, de conteúdo ou de comunicação, com uma linha por problema. */
export class ImportError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ImportError';
  }
}

/** Prefixo das páginas na instância CMS (a doc pública mora em `/docs`). */
const CMS_BASE = '/docs';

const MIMES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};
/** O logo no CMS aceita menos formatos que as imagens do conteúdo. */
const LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);

function readFile(file: string): ExportedFile | null {
  const mime = MIMES[path.extname(file).toLowerCase()];
  return mime ? { mime, base64: readFileSync(file).toString('base64') } : null;
}

/** Doc Tiptap de uma tab do snapshot que o build do site monta. */
const docOf = (tab: PageSnapshot['tabs'][number] | undefined): TiptapDoc => blocksToTiptapDoc(tab?.blocks ?? []);

/**
 * O projeto do modo estático no formato de `migration.import` (SYS-112). Passa
 * pelas mesmas validações do `check` — conteúdo inválido não chega à
 * instância. Os previews ficam de fora: a instância tem os dela, publicados
 * pelo CI.
 */
export async function buildImportPayload(
  config: ResolvedConfig,
  overwrite = false,
): Promise<{ payload: InstanceImport; warnings: string[] }> {
  const prepared = await prepareSite({ ...config, previews: false });
  if (prepared.problems.length) {
    throw new ImportError([...prepared.problems, 'corrija o conteúdo (systembook check) antes de importar.']);
  }
  const warnings: string[] = [];
  const problems: string[] = [];

  // De novo, com os endereços da instância: links em `/docs/…` e cada imagem
  // do projeto com o caminho no conteúdo como `src` (a instância o troca pela
  // URL dela).
  const site = buildSiteData(prepared.tree, {
    settings: prepared.site.data.settings,
    base: CMS_BASE,
    imageUrl: (relativePath) => relativePath,
  });

  const images = new Map<string, ImportedImage>();
  for (const image of site.images) {
    if (image.path === null || images.has(image.path)) continue;
    const file = readFile(path.join(config.contentDir, image.path));
    if (!file) {
      problems.push(`${image.file}:${image.line}:${image.column}  imagem "${image.src}": formato não aceito pelo CMS (${Object.keys(MIMES).join(', ')}).`);
      continue;
    }
    images.set(image.path, { ref: image.path, ...file });
  }

  const logo = (field: 'logo' | 'logoDark'): ExportedFile | null => {
    const value = config[field];
    if (!value) return null;
    if (/^(https?:)?\/\//i.test(value)) {
      warnings.push(`${config.file}: "${field}" é uma URL e não foi importado — envie o logo em Settings na instância.`);
      return null;
    }
    const file = readFile(path.resolve(config.root, value));
    if (!file || !LOGO_MIMES.has(file.mime)) {
      problems.push(`${config.file}: "${field}": o logo do CMS precisa ser PNG, JPEG ou SVG (${value}).`);
      return null;
    }
    return file;
  };

  const settings = {
    nome: config.name,
    logo: logo('logo'),
    logoDark: logo('logoDark'),
    statusTags: config.statusTags.map((tag) => ({ titulo: tag.titulo, cor: tag.cor })),
  };
  if (problems.length) throw new ImportError(problems);

  const menus = prepared.tree.menus.map((menu) => ({
    titulo: menu.titulo,
    slug: menu.slug,
    sections: menu.sections.map((section) => ({
      titulo: section.titulo,
      slug: section.slug,
      pages: section.pages.map((page) => {
        const { snapshot } = site.data.pages[pageKey({ menuSlug: menu.slug, sectionSlug: section.slug, pageSlug: page.slug })]!;
        // O build sempre monta o snapshot das páginas do conteúdo.
        const [body, ...tabs] = snapshot!.tabs;
        return {
          titulo: page.titulo,
          slug: page.slug,
          subtitulo: page.subtitulo,
          overviewTitulo: page.overviewTitulo,
          status: page.status,
          body: docOf(body),
          tabs: page.tabs.map((tab, i) => ({ titulo: tab.titulo, slug: tab.slug, doc: docOf(tabs[i]) })),
        };
      }),
    })),
  }));

  const landing = site.data.landing ? docOf(site.data.landing.tabs[0]) : null;
  const embeds = (JSON.stringify([landing, menus]).match(/"type":"componentEmbed"/g) ?? []).length;
  if (embeds) {
    warnings.push(
      `o conteúdo tem ${embeds} embed(s) de componente: os previews não vão no import e aparecem como "no preview published" até o CI de previews enviá-los para a instância (docs/ci-example.md).`,
    );
  }

  return {
    payload: {
      version: 1,
      settings,
      landing,
      menus,
      images: [...images.values()],
      overwrite,
    },
    warnings,
  };
}

/**
 * `systembook import` (SYS-112): envia o projeto do modo estático para uma
 * instância CMS, que cria a estrutura e publica tudo. Página que já existe
 * faz o import inteiro falhar (com a lista), a não ser com `overwrite`.
 */
export async function importProject(config: ResolvedConfig, options: ImportOptions): Promise<ImportOutcome> {
  let base: URL;
  try {
    base = new URL(options.to);
  } catch {
    throw new ImportError([`--to precisa ser a URL da instância (ex.: https://docs.acme.dev), não "${options.to}".`]);
  }
  const { payload, warnings } = await buildImportPayload(config, options.overwrite);

  const doFetch = options.fetch ?? fetch;
  const url = new URL('trpc/migration.import', base.href.endsWith('/') ? base : `${base.href}/`);
  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new ImportError([`não foi possível conectar a ${base.origin}: ${(error as Error).message}`]);
  }

  const body = (await response.json().catch(() => null)) as {
    result?: { data?: ImportResult };
    error?: { message?: string };
  } | null;
  if (response.ok && body?.result?.data) return { ...body.result.data, warnings };

  const message = body?.error?.message;
  if (response.status === 401) {
    throw new ImportError(['a instância recusou o token — gere um token de escopo "Migration" em Settings → Tokens (como admin).']);
  }
  if (response.status === 404) {
    throw new ImportError([`${base.href} não tem o import — confira a URL e atualize a instância para uma versão com o import.`]);
  }
  if (response.status === 409 && message) {
    throw new ImportError([
      ...message.split('\n'),
      options.overwrite
        ? 'nada foi importado.'
        : 'nada foi importado. Para substituir as páginas que já existem, rode de novo com --overwrite.',
    ]);
  }
  if (response.status === 413) {
    throw new ImportError(['o projeto é maior do que o proxy na frente da instância aceita — aumente o limite de corpo da requisição (ex.: client_max_body_size no nginx).']);
  }
  throw new ImportError([message ? `a instância recusou o import: ${message}` : `a instância respondeu HTTP ${response.status} ao import.`]);
}
