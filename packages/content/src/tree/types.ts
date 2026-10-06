import type { TiptapDoc } from '../blocks.js';
import type { Diagnostic } from '../diagnostics.js';
import type { ContentReferences } from '../parse/index.js';

/** Arquivo do diretório de conteúdo, com caminho relativo a ele (separador `/`). */
export interface ContentFile {
  path: string;
  source: string;
}

/** Documento lido de um arquivo `.md`/`.mdx`. */
export interface ContentDocument {
  /** Caminho relativo ao diretório de conteúdo. */
  file: string;
  doc: TiptapDoc;
  references: ContentReferences;
}

export interface TabNode extends ContentDocument {
  slug: string;
  titulo: string;
  order: number | undefined;
}

export interface PageNode {
  slug: string;
  titulo: string;
  subtitulo: string | null;
  /** Rótulo da visão do corpo (`overviewTitle`); `null` = "Overview". */
  overviewTitulo: string | null;
  /** `titulo` de uma tag de `statusTags`, já validado. */
  status: string | null;
  order: number | undefined;
  /** Corpo da página (a visão "Overview"). */
  body: ContentDocument;
  /** Tabs além do corpo, já ordenadas. */
  tabs: TabNode[];
}

export interface SectionNode {
  slug: string;
  titulo: string;
  order: number | undefined;
  pages: PageNode[];
}

export interface MenuNode {
  slug: string;
  titulo: string;
  order: number | undefined;
  sections: SectionNode[];
}

export interface LandingNode extends ContentDocument {
  /** `title` do frontmatter, se houver (vira o `<title>` do HTML). */
  titulo: string | null;
}

export interface ContentTree {
  landing: LandingNode | null;
  /** Só menus e seções com ao menos uma página, já ordenados. */
  menus: MenuNode[];
  /** Problemas de todos os arquivos e da estrutura; vazio = conteúdo válido. */
  diagnostics: Diagnostic[];
}

export interface BuildTreeOptions {
  /** Títulos das tags de status aceitas no frontmatter (`statusTags` da config). */
  statusTags?: readonly string[];
}
