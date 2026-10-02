import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PublicComponentPreview } from '@systembook/schema';
import { discoverPreviews, previewEntryName, type DiscoveredPreview } from '@systembook/connector';
import {
  buildContentTree,
  buildSiteData,
  formatDiagnostic,
  previewKey,
  type ContentDocument,
  type ContentTree,
  type Diagnostic,
  type SiteBuild,
} from '@systembook/content';
import { readContentDir } from '@systembook/content/node';
import type { ResolvedConfig } from '../config.js';

/** Pasta dos artefatos de preview no site, relativa à base. */
export const PREVIEWS_DIR = '_systembook/previews';
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
  site: SiteBuild;
  /** Previews descobertos; vazio com previews desabilitados ou sem `*.preview.tsx`. */
  previews: DiscoveredPreview[];
  /** Imagens e logos a copiar, um por destino, em ordem estável. */
  media: MediaFile[];
  /** Todos os problemas (conteúdo, referências, config), já formatados. */
  problems: string[];
}

/**
 * Tudo o que o build precisa saber antes de escrever um byte (SYS-100), e o
 * que o `systembook check` valida: a árvore e os dados do conteúdo, os
 * previews descobertos, as imagens e os logos referenciados — e todos os
 * problemas de uma vez, com `arquivo:linha:coluna`.
 */
export async function prepareSite(config: ResolvedConfig): Promise<PreparedSite> {
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

  // ---- previews ----
  let previews: DiscoveredPreview[] = [];
  if (config.previews !== false) {
    const discovery = await discoverPreviews({ root: config.root });
    previews = discovery.previews;
    for (const failure of discovery.failures) {
      problems.push(`${relative(config, failure.filePath)}  ${failure.message.split('\n').join('\n  ')}`);
    }
  }
  // Com previews (habilitados e existentes), todo par referenciado precisa existir.
  const checkPreviews = config.previews === true || previews.length > 0;
  if (checkPreviews) contentDiagnostics.push(...missingPreviews(tree, previews));

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
        url: `${config.base}${PREVIEWS_DIR}/${entry}/index.html`,
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
  const settings = { nomeDesignSystem: config.name, logoUrl: logo('logo'), logoDarkUrl: logo('logoDark') };

  // ---- dados, com as imagens copiadas com hash ----
  const site = buildSiteData(tree, {
    settings,
    base: config.base,
    previews: previewMap,
    imageUrl: (relativePath) => {
      const source = path.join(config.contentDir, relativePath);
      // Inexistente: a URL não importa, o build para no erro abaixo.
      return isFile(source) ? mediaUrl(source) : `${config.base}${relativePath}`;
    },
  });
  contentDiagnostics.push(...site.diagnostics);
  for (const image of site.images) {
    if (image.path !== null && !isFile(path.join(config.contentDir, image.path))) {
      contentDiagnostics.push({
        file: image.file,
        line: image.line,
        column: image.column,
        message: `imagem "${image.src}" não encontrada.`,
      });
    }
  }

  const contentDir = relative(config, config.contentDir);
  // Por arquivo e posição, não por tipo de verificação: lê-se de cima a baixo.
  const formatted = contentDiagnostics
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)
    .map((d) => formatDiagnostic({ ...d, file: contentDir ? `${contentDir}/${d.file}` : d.file }));

  return {
    tree,
    site,
    previews,
    media: [...media.values()].sort((a, b) => a.target.localeCompare(b.target)),
    problems: [...problems, ...formatted],
  };
}

/** Caminho relativo à raiz do projeto, com `/` em qualquer sistema. */
export function relative(config: ResolvedConfig, file: string): string {
  return path.relative(config.root, file).split(path.sep).join('/');
}

function isFile(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
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

/** Pares componente/variante referenciados que nenhum `*.preview.tsx` declara. */
function missingPreviews(tree: ContentTree, previews: DiscoveredPreview[]): Diagnostic[] {
  const variants = new Map<string, string[]>();
  for (const preview of previews) variants.set(preview.config.component, preview.config.variants.map((v) => v.id));
  const known = [...variants.keys()].sort();

  const diagnostics: Diagnostic[] = [];
  for (const document of documents(tree)) {
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
