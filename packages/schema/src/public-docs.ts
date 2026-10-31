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

/**
 * Idiomas (SYS-162). Uma instância publica a doc em um ou mais idiomas, sempre
 * com um padrão. A fonte de dados é **vinculada a um idioma** — a doc pede uma
 * por idioma a uma `DocsDataSourceFactory` —, então as leituras não recebem o
 * locale como parâmetro: tudo que uma fonte devolve (nav, landing, páginas,
 * busca) já está no idioma dela. Na URL, o padrão fica sem prefixo e os demais
 * ficam sob `/<código-em-minúsculas>/` (helpers em `@systembook/content/site`).
 *
 * Com um único idioma, `locales` tem só o padrão e nada muda na doc: sem
 * prefixo, sem seletor, sem aviso, sem `hreflang`.
 */

/** Idioma publicado. */
export interface LocaleInfo {
  /** Código BCP 47 (`en`, `pt-BR`), único na instância. */
  code: string;
  /** Nome exibido no seletor, no próprio idioma (`English`, `Português`). */
  label: string;
}

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
  /**
   * Idiomas publicados, o padrão primeiro; nunca vazio. Iguais em qualquer
   * idioma da fonte.
   */
  locales: LocaleInfo[];
  /** Código do idioma padrão — o servido sem prefixo e o destino do fallback. */
  defaultLocale: string;
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
  /**
   * Idioma realmente servido. Difere do idioma da fonte no **fallback**: a
   * página existe mas não tem tradução publicada no idioma pedido, e a fonte
   * devolve o conteúdo do padrão (com `locale` = padrão) em vez de `null`. A
   * doc mostra um aviso e aponta o `canonical` para a URL do padrão.
   */
  locale: string;
  /**
   * Endereço da mesma página em cada idioma em que ela está publicada, por
   * código — com os slugs traduzidos, inclusive o idioma servido. Idioma sem a
   * página publicada fica de fora; no fallback, só o padrão (e outros idiomas
   * traduzidos) aparece. Com um único idioma, só o padrão. Alimenta o seletor
   * de idioma e o `hreflang`.
   */
  alternates: Record<string, PublicPageRef>;
}

/** Forma canônica de um path público legado (ver `DocsDataSource.resolvePath`). */
export interface ResolvedPublicPath extends PublicPageRef {
  tabId: string | null;
}

/**
 * Resultado da busca da doc pública. Não carrega idioma: a busca roda no
 * índice do idioma da fonte, e os títulos e slugs vêm nele.
 */
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

/**
 * Fonte de dados da doc pública, vinculada a um idioma (ver `LocaleInfo`).
 * Toda leitura é assíncrona.
 */
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
   * Design tokens publicados (SYS-129), ou `null` sem nenhum token — nunca um
   * conjunto com a lista vazia, para CMS e estático esconderem a mesma coisa.
   * Os grupos (`color.brand`) saem dos `path`.
   */
  getTokens(): Promise<TokenSet | null>;
}

/**
 * Fonte de dados por idioma (SYS-162). `locale` é um código de
 * `PublicSettings.locales`; `null` pede o padrão, para quem ainda não sabe
 * qual é — a doc lê os idiomas pelo `getSettings` da fonte `null` antes de
 * resolver o prefixo da URL. Pode devolver a mesma instância a cada chamada
 * com o mesmo argumento, mas não precisa.
 */
export type DocsDataSourceFactory = (locale: string | null) => DocsDataSource;
