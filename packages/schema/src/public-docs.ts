import type { PageSnapshot } from './block.js';
import type { PreviewConfig } from './preview-config.js';
import type { TokenSet } from './tokens.js';

/**
 * Contrato de dados da documentação pública (SYS-87).
 *
 * A doc pública não sabe de onde vem o conteúdo: no modo CMS ele sai do
 * servidor (tRPC); no modo estático, de JSONs gerados no build. As duas fontes
 * implementam `DocsDataSource`, e os componentes públicos só conversam com
 * ela. As procedures públicas do server declaram estes tipos como retorno, então
 * o typecheck quebra se o servidor e o contrato divergirem.
 */

/** Página publicada na árvore de navegação. */
export interface PublicNavPage {
  id: string;
  titulo: string;
  slug: string;
}

/** Seção com ao menos uma página publicada. */
export interface PublicNavSection {
  id: string;
  titulo: string;
  slug: string;
  pages: PublicNavPage[];
}

/** Menu (nav do header) com ao menos uma seção publicada. */
export interface PublicNavMenu {
  id: string;
  titulo: string;
  slug: string;
  ordem: number;
  sections: PublicNavSection[];
}

/**
 * Árvore de navegação pública: menus → seções → páginas, já ordenada e sem
 * nós vazios. A landing não faz parte dela.
 */
export type PublicNavTree = PublicNavMenu[];

/** Identidade da instância exibida na doc pública. */
export interface PublicSettings {
  nomeDesignSystem: string;
  /** URL do logo claro, ou `null` sem logo (a doc mostra o nome em texto). */
  logoUrl: string | null;
  /** URL do logo escuro, ou `null` (a doc cai no claro). */
  logoDarkUrl: string | null;
}

/** Endereço canônico de uma página: `/docs/:menuSlug/:sectionSlug/:pageSlug`. */
export interface PublicPageRef {
  menuSlug: string;
  sectionSlug: string;
  pageSlug: string;
}

/** Página resolvida por slug e seu conteúdo publicado. */
export interface PublishedPage {
  pageId: string;
  titulo: string;
  subtitulo: string | null;
  /** Última revisão publicada, ou `null` se a página nunca foi publicada. */
  snapshot: PageSnapshot | null;
}

/** Forma canônica de um path público legado (ver `DocsDataSource.resolvePath`). */
export interface ResolvedPublicPath extends PublicPageRef {
  tabId: string | null;
}

/** Resultado da busca da doc pública. */
export interface PublicSearchResult {
  pageId: string;
  pageTitulo: string;
  pageSlug: string;
  sectionTitulo: string;
  sectionSlug: string | null;
  /** Menu dono da seção; `null` cai na URL legada sem menu. */
  menuSlug: string | null;
  /**
   * Trecho do conteúdo com os termos casados entre os caracteres de controle
   * STX (U+0002, abre) e ETX (U+0003, fecha) — não HTML, para o cliente poder
   * escapar o texto antes de destacar.
   */
  snippet: string;
}

/** Par que um bloco `component-embed` (ou o cover de um dos-donts) referencia. */
export interface ComponentPreviewRef {
  componentName: string;
  variantId: string;
}

/** Preview publicado de uma variante de componente (SYS-89). */
export interface PublicComponentPreview {
  /** URL do artefato estático, usada como `src` do iframe. */
  url: string;
  /** `PreviewConfig` co-localizado; `null` em artefatos sem config (o painel de controles some). */
  config: PreviewConfig | null;
}

/** Fonte de dados da doc pública. Toda leitura é assíncrona. */
export interface DocsDataSource {
  /** Árvore de navegação pública. */
  getNavTree(): Promise<PublicNavTree>;
  /** Nome e logos da instância. */
  getSettings(): Promise<PublicSettings>;
  /** Conteúdo publicado da landing, ou `null` se ela nunca foi publicada. */
  getLanding(): Promise<PageSnapshot | null>;
  /** Página pelo endereço canônico, ou `null` se o endereço não existe. */
  getPageBySlug(ref: PublicPageRef): Promise<PublishedPage | null>;
  /** Última revisão publicada de uma página pelo id (rota `/p/:pageId`). */
  getPageById(pageId: string): Promise<PageSnapshot | null>;
  /**
   * Resolve os segmentos crus de um path de `/docs` (2 a 4) para a forma
   * canônica — cobre as URLs anteriores à entrada do menu no path
   * (`section/page`, `section/page/tab`). `null` quando nada casa (404),
   * inclusive para qualquer outra quantidade de segmentos.
   */
  resolvePath(segments: string[]): Promise<ResolvedPublicPath | null>;
  /** Busca no conteúdo publicado. `q` nunca é vazio. */
  search(q: string): Promise<PublicSearchResult[]>;
  /** Preview publicado mais recente de uma variante, ou `null` se não há. */
  getComponentPreview(ref: ComponentPreviewRef): Promise<PublicComponentPreview | null>;
  /**
   * Design tokens publicados (projeto "Design tokens"), ou `null` quando a
   * instância não tem tokens — a doc esconde o que depende deles. Os grupos
   * (`color.brand`) saem dos `path`, sem leitura própria.
   */
  getTokens(): Promise<TokenSet | null>;
}
