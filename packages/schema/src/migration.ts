import type { PageSnapshot } from './block.js';

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
