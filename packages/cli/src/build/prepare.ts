import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PublicComponentPreview, TokenSet } from '@systembook/schema';
import {
  discoverPreviews,
  previewEntryName,
  type DiscoveredPreview,
  type DiscoveryResult,
} from '@systembook/connector';
import {
  buildContentTree,
  buildLocaleTree,
  buildSiteData,
  formatDiagnostic,
  previewKey,
  type ContentDocument,
  type ContentTree,
  type Diagnostic,
  type LocaleTree,
  type SiteBuild,
} from '@systembook/content';
import { localeSegment } from '@systembook/content/site';
import { readContentDir } from '@systembook/content/node';
import type { ResolvedConfig } from '../config.js';
import { loadProjectTokens } from '../tokens.js';

/** Pasta dos artefatos de preview no site, relativa à base. */
export const PREVIEWS_DIR = '_systembook/previews';
/** URL da pasta de previews no site, com a base. */
export const previewsBase = (config: ResolvedConfig) => `${config.base}${PREVIEWS_DIR}/`;
/** Pasta das imagens do conteúdo e dos logos, relativa à base. */
export const MEDIA_DIR = '_systembook/media';

/** Um arquivo do projeto que o build copia para o site. */
export interface MediaFile {
  /** Caminho absoluto no projeto. */
  source: string;
  /** Caminho no site, relativo ao `outDir` (`_systembook/media/logo-1a2b3c4d.svg`). */
  target: string;
}

export interface PreparedSite {
  tree: ContentTree;
  /** Árvore de cada idioma de tradução (SYS-187), por código; sem a pasta, o idioma não entra. */
  translations: Record<string, LocaleTree>;
  /** `title` da landing por idioma (o `<title>` do HTML), com o do padrão onde falta tradução. */
  landingTitles: Record<string, string | null>;
  site: SiteBuild;
  /** Previews descobertos; vazio com previews desabilitados ou sem `*.preview.tsx`. */
  previews: DiscoveredPreview[];
  /** Imagens e logos a copiar, um por destino, em ordem estável. */
  media: MediaFile[];
  /** Design tokens válidos da config (SYS-128); `null` sem tokens. */
  tokens: TokenSet | null;
  /** Todos os problemas (conteúdo, referências, config, tokens), já formatados. */
  problems: string[];
  /** O que não impede o build (avisos dos tokens), já formatado. */
  warnings: string[];
}

export interface PrepareOptions {
  /**
   * Resultado de um `discoverPreviews` já feito: o `systembook dev` reaproveita
   * a descoberta quando só o conteúdo mudou (ela carrega cada `*.preview.tsx`).
   */
  discovery?: DiscoveryResult;
}

/**
 * Tudo o que o build precisa saber antes de escrever um byte (SYS-100), e o
 * que o `systembook check` valida: a árvore e os dados do conteúdo, os
 * previews descobertos, as imagens e os logos referenciados — e todos os
 * problemas de uma vez, com `arquivo:linha:coluna`.
 */
export async function prepareSite(config: ResolvedConfig, options: PrepareOptions = {}): Promise<PreparedSite> {
  const problems: string[] = [];
  const contentDiagnostics: Diagnostic[] = [];
  /** Por destino: arquivos iguais (mesmo nome e conteúdo) viram um só. */
  const media = new Map<string, MediaFile>();
  const targets = new Map<string, string>();

  /** Copia `source` com hash do conteúdo no nome; devolve a URL no site. */
  const mediaUrl = (source: string) => {
    let target = targets.get(source);
    if (!target) {
      const hash = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 8);
      const { name, ext } = path.parse(source);
      target = `${MEDIA_DIR}/${name}-${hash}${ext}`;
      targets.set(source, target);
      if (!media.has(target)) media.set(target, { source, target });
    }
    return `${config.base}${target}`;
  };

  const tree = buildContentTree(await readContentDir(config.contentDir), {
    statusTags: config.statusTags.map((tag) => tag.titulo),
  });
  contentDiagnostics.push(...tree.diagnostics);
  /** Problemas de arquivos das pastas de tradução, já com o caminho a partir da raiz. */
  const translationDiagnostics: Diagnostic[] = [];
  const warnings: string[] = [];

  // ---- idiomas de tradução (SYS-187) ----
  const translations: Record<string, LocaleTree> = {};
  for (const locale of config.locales.translations) {
    const dir = relative(config, locale.dir);
    if (!isDirectory(locale.dir)) {
      // Sem a pasta (o git não guarda pasta vazia), o idioma sai todo no padrão.
      warnings.push(`${dir}: pasta de "${locale.code}" não encontrada — o idioma sai inteiro no idioma padrão.`);
      continue;
    }
    const translation = buildLocaleTree(tree, await readContentDir(locale.dir));
    translations[locale.code] = translation;
    translationDiagnostics.push(...translation.diagnostics.map((d) => ({ ...d, file: `${dir}/${d.file}` })));
  }
  // O primeiro segmento da URL que é o de um idioma não chega ao menu de mesmo slug.
  for (const locale of config.locales.translations) {
    const menu = tree.menus.find((m) => m.slug === localeSegment(locale.code));
    if (menu) {
      problems.push(
        `${relative(config, path.join(config.contentDir, menu.path))}/: o menu "${menu.slug}" tem o mesmo endereço que o prefixo do idioma "${locale.code}" (/${menu.slug}/) — mude o slug do menu.`,
      );
    }
  }

  // ---- previews ----
  let previews: DiscoveredPreview[] = [];
  if (config.previews !== false) {
    const discovery = options.discovery ?? (await discoverPreviews({ root: config.root }));
    previews = discovery.previews;
    for (const failure of discovery.failures) {
      problems.push(`${relative(config, failure.filePath)}  ${failure.message.split('\n').join('\n  ')}`);
    }
  }
  // O site é um app React, e os previews montam com o react/react-dom do
  // projeto. Eles são peer dependencies do CLI, que o yarn 1 (e o npm com
  // --legacy-peer-deps) não instalam: sem eles o `build` falharia com um erro
  // do Rollup — o `check` acusa antes, com o que fazer.
  const resolvers = [createRequire(import.meta.url)];
  if (previews.length) resolvers.push(createRequire(path.join(config.root, 'package.json')));
  for (const pkg of ['react', 'react-dom']) {
    const missing = resolvers.some((resolve) => {
      try {
        resolve.resolve(`${pkg}/package.json`);
        return false;
      } catch {
        return true;
      }
    });
    if (missing) {
      problems.push(
        `${pkg} não está instalado no projeto — o site e os previews precisam dele. Instale react e react-dom (o yarn 1 não instala peer dependencies).`,
      );
    }
  }
  // Com previews (habilitados e existentes), todo par referenciado precisa existir.
  const checkPreviews = config.previews === true || previews.length > 0;
  if (checkPreviews) {
    contentDiagnostics.push(...missingPreviews(documents(tree), previews));
    for (const locale of config.locales.translations) {
      const translation = translations[locale.code];
      if (!translation) continue;
      const dir = relative(config, locale.dir);
      translationDiagnostics.push(
        ...missingPreviews(translatedDocuments(translation), previews).map((d) => ({ ...d, file: `${dir}/${d.file}` })),
      );
    }
  }

  const previewMap: Record<string, PublicComponentPreview> = {};
  const entryOwners = new Map<string, string>();
  for (const preview of previews) {
    for (const variant of preview.config.variants) {
      const entry = previewEntryName(preview.config.component, variant.id);
      // O artefato de cada variante é uma pasta com este nome: dois pares que
      // dão o mesmo nome (o mesmo componente em dois arquivos, `Foo Bar` e
      // `foo-bar`) se sobrescreveriam.
      const owner = entryOwners.get(entry);
      if (owner) {
        problems.push(
          `${relative(config, preview.filePath)}  "${preview.config.component}" / "${variant.id}" gera o mesmo preview (${entry}) que ${owner} — renomeie o componente ou a variante.`,
        );
        continue;
      }
      entryOwners.set(entry, relative(config, preview.filePath));
      previewMap[previewKey({ componentName: preview.config.component, variantId: variant.id })] = {
        url: `${previewsBase(config)}${entry}/index.html`,
        config: preview.config,
      };
    }
  }

  // ---- logos ----
  const logo = (field: 'logo' | 'logoDark'): string | null => {
    const value = config[field];
    if (!value) return null;
    // URL (`https://…`, `//cdn…`) fica como está; o resto é arquivo do projeto.
    if (/^(https?:)?\/\//i.test(value)) return value;
    const source = path.resolve(config.root, value);
    if (relative(config, source).startsWith('../') || path.isAbsolute(relative(config, source))) {
      problems.push(`${config.file}: "${field}": o arquivo precisa estar dentro do projeto (${value}).`);
      return null;
    }
    if (!isFile(source)) {
      problems.push(`${config.file}: "${field}": arquivo não encontrado (${value}).`);
      return null;
    }
    return mediaUrl(source);
  };
  const settings = {
    nomeDesignSystem: config.name,
    logoUrl: logo('logo'),
    logoDarkUrl: logo('logoDark'),
    locales: [config.locales.default, ...config.locales.translations.map(({ code, label }) => ({ code, label }))],
    defaultLocale: config.locales.default.code,
  };

  // ---- tokens ----
  const tokens = await loadProjectTokens(config);
  problems.push(...tokens.problems);

  // ---- dados, com as imagens copiadas com hash ----
  const translationDirs = new Map(config.locales.translations.map((locale) => [locale.code, locale.dir]));
  /**
   * Arquivo de uma imagem. Numa tradução, a da pasta do idioma — uma captura
   * de tela traduzida — ou, sem ela, a do conteúdo padrão no mesmo caminho:
   * a tradução não precisa copiar as imagens que não mudam. `null` = não existe.
   */
  const imageSource = (relativePath: string, locale: string | null): string | null => {
    const localeDir = locale === null ? undefined : translationDirs.get(locale);
    const candidates = [...(localeDir ? [path.join(localeDir, relativePath)] : []), path.join(config.contentDir, relativePath)];
    return candidates.find(isFile) ?? null;
  };
  const site = buildSiteData(tree, {
    settings,
    base: config.base,
    previews: previewMap,
    tokens: tokens.set,
    translations,
    imageUrl: (relativePath, locale) => {
      const source = imageSource(relativePath, locale);
      // Inexistente: a URL não importa, o build para no erro abaixo.
      return source ? mediaUrl(source) : `${config.base}${relativePath}`;
    },
  });
  contentDiagnostics.push(...site.diagnostics);
  for (const [code, diagnostics] of Object.entries(site.translationDiagnostics)) {
    const dir = relative(config, translationDirs.get(code)!);
    translationDiagnostics.push(...diagnostics.map((d) => ({ ...d, file: `${dir}/${d.file}` })));
  }
  for (const image of site.images) {
    if (image.path === null || imageSource(image.path, image.locale)) continue;
    const diagnostic = { file: image.file, line: image.line, column: image.column, message: `imagem "${image.src}" não encontrada.` };
    if (image.locale === null) contentDiagnostics.push(diagnostic);
    else translationDiagnostics.push({ ...diagnostic, file: `${relative(config, translationDirs.get(image.locale)!)}/${image.file}` });
  }

  const contentDir = relative(config, config.contentDir);
  // Por arquivo e posição, não por tipo de verificação: lê-se de cima a baixo.
  const formatted = [
    ...contentDiagnostics.map((d) => ({ ...d, file: contentDir ? `${contentDir}/${d.file}` : d.file })),
    ...translationDiagnostics,
  ]
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
    .map(formatDiagnostic);

  const landingTitles: Record<string, string | null> = { [settings.defaultLocale]: tree.landing?.titulo ?? null };
  for (const { code } of config.locales.translations) {
    landingTitles[code] = translations[code]?.landing?.titulo ?? tree.landing?.titulo ?? null;
  }

  return {
    tree,
    translations,
    landingTitles,
    site,
    previews,
    media: [...media.values()].sort((a, b) => a.target.localeCompare(b.target)),
    tokens: tokens.set,
    problems: [...problems, ...formatted],
    warnings: [...warnings, ...tokens.warnings],
  };
}

/** Caminho relativo à raiz do projeto, com `/` em qualquer sistema. */
export function relative(config: ResolvedConfig, file: string): string {
  return path.relative(config.root, file).split(path.sep).join('/');
}

function isFile(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

function isDirectory(dir: string): boolean {
  return statSync(dir, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/** Todos os documentos da árvore (landing, corpos e tabs). */
function documents(tree: ContentTree): ContentDocument[] {
  const out: ContentDocument[] = tree.landing ? [tree.landing] : [];
  for (const menu of tree.menus) {
    for (const section of menu.sections) {
      for (const page of section.pages) out.push(page.body, ...page.tabs);
    }
  }
  return out;
}

/** Os documentos traduzidos de um idioma (landing, corpos e tabs). */
function translatedDocuments(tree: LocaleTree): ContentDocument[] {
  const out: ContentDocument[] = tree.landing ? [tree.landing] : [];
  for (const menu of tree.menus) {
    for (const section of menu.sections) {
      for (const page of section.pages) {
        if (page.body) out.push(page.body);
        for (const tab of page.tabs) if (tab.document) out.push(tab.document);
      }
    }
  }
  return out;
}

/** Pares componente/variante referenciados que nenhum `*.preview.tsx` declara. */
function missingPreviews(docs: ContentDocument[], previews: DiscoveredPreview[]): Diagnostic[] {
  const variants = new Map<string, string[]>();
  for (const preview of previews) variants.set(preview.config.component, preview.config.variants.map((v) => v.id));
  const known = [...variants.keys()].sort();

  const diagnostics: Diagnostic[] = [];
  for (const document of docs) {
    for (const ref of document.references.components) {
      const ids = variants.get(ref.componentName);
      if (ids?.includes(ref.variantId)) continue;
      const message = ids
        ? `variante "${ref.variantId}" de "${ref.componentName}" não existe nos *.preview.tsx — variantes: ${ids.join(', ')}.`
        : `componente "${ref.componentName}" não tem *.preview.tsx — componentes com preview: ${known.join(', ') || 'nenhum'}.`;
      diagnostics.push({ file: document.file, line: ref.line, column: ref.column, message });
    }
  }
  return diagnostics;
}
