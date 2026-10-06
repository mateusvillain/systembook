import type { PageSnapshot, TiptapJson } from './block.js';

/**
 * Contrato do export de uma instância CMS (SYS-110), consumido pelo
 * `systembook export` (SYS-111) para gerar um projeto do modo estático. É o
 * conteúdo **publicado**: rascunhos, revisões antigas, usuários e tokens
 * ficam de fora (`docs/migration.md`).
 */

/** Arquivo binário embutido no JSON (logos). */
export interface ExportedFile {
  mime: string;
  base64: string;
}

export interface ExportedPage {
  titulo: string;
  slug: string;
  subtitulo: string | null;
  ordem: number;
  /** `titulo` da status tag da página, ou `null`. */
  status: string | null;
  /** Última revisão publicada: corpo (tab primária) e tabs, com os blocos. */
  snapshot: PageSnapshot;
}

export interface ExportedSection {
  titulo: string;
  slug: string;
  ordem: number;
  pages: ExportedPage[];
}

export interface ExportedMenu {
  titulo: string;
  slug: string;
  ordem: number;
  sections: ExportedSection[];
}

/** Página que nunca foi publicada e por isso não entrou no export. */
export interface UnpublishedPageRef {
  menu: string;
  section: string;
  slug: string;
  titulo: string;
}

export interface InstanceExport {
  /** Versão do formato; muda quando o shape muda de forma incompatível. */
  version: 1;
  settings: {
    nome: string;
    logo: ExportedFile | null;
    logoDark: ExportedFile | null;
    statusTags: { titulo: string; cor: string }[];
  };
  /** Landing publicada, ou `null` (a doc mostra a landing padrão). */
  landing: PageSnapshot | null;
  /** Menus e seções em ordem; só com páginas publicadas (podem ficar vazios). */
  menus: ExportedMenu[];
  unpublished: UnpublishedPageRef[];
}

/**
 * Contrato do import de um projeto do modo estático numa instância CMS
 * (SYS-112), montado pelo `systembook import`. A árvore já vem validada pelo
 * `check`; cada corpo/tab é um doc Tiptap.
 *
 * Endereços no conteúdo:
 * - links entre páginas vêm como `/docs/<menu>/<seção>/<página>[/<slug da tab>]`
 *   (a landing é `/docs`); a instância troca o slug da tab pelo id que criou;
 * - imagens do projeto vêm com o `src` igual ao `ref` de uma entrada de
 *   `images`, que a instância guarda e serve.
 */
export interface ImportedTab {
  titulo: string;
  slug: string;
  doc: TiptapJson;
}

export interface ImportedPage {
  titulo: string;
  slug: string;
  subtitulo: string | null;
  /** Rótulo da visão do corpo (padrão "Overview"); opcional por compat com CLIs antigos. */
  overviewTitulo?: string | null;
  /** `titulo` de uma das `statusTags`, ou `null`. */
  status: string | null;
  /** Corpo da página (a tab primária no CMS). */
  body: TiptapJson;
  tabs: ImportedTab[];
}

export interface ImportedSection {
  titulo: string;
  slug: string;
  pages: ImportedPage[];
}

export interface ImportedMenu {
  titulo: string;
  slug: string;
  sections: ImportedSection[];
}

export interface ImportedImage extends ExportedFile {
  /** Como o `src` aparece no conteúdo. */
  ref: string;
}

export interface InstanceImport {
  version: 1;
  settings: {
    nome: string;
    logo: ExportedFile | null;
    logoDark: ExportedFile | null;
    statusTags: { titulo: string; cor: string }[];
  };
  /** Corpo da landing, ou `null` (a instância mantém a dela). */
  landing: TiptapJson | null;
  /** Menus, seções e páginas na ordem do projeto. */
  menus: ImportedMenu[];
  images: ImportedImage[];
  /** Substitui páginas (e a landing) que já existem, em vez de falhar. */
  overwrite: boolean;
}

export interface ImportResult {
  created: { menus: number; sections: number; pages: number };
  /** Páginas que já existiam e foram substituídas (só com `overwrite`). */
  replaced: number;
  images: number;
  /** Nome e logos aplicados (instância vazia ou `overwrite`). */
  settingsApplied: boolean;
}
