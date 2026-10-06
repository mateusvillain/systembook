import type { PageSnapshot } from './block.js';
import type { PublicComponentPreview, PublicNavTree, PublicSettings, PublishedPage } from './public-docs.js';
import type { TokenSet } from './tokens.js';

/**
 * Dados do site estático (SYS-96): o que o build gera a partir do conteúdo em
 * arquivos e o `staticDataSource` da doc pública lê. É o mesmo contrato do
 * `DocsDataSource`, só que pré-computado — cada campo responde a uma leitura.
 * Os caminhos dos arquivos JSON ficam em `@systembook/content/site`.
 */
export interface StaticSiteData {
  settings: PublicSettings;
  nav: PublicNavTree;
  /** Landing (`docs/index.mdx`), ou `null` sem landing. */
  landing: PageSnapshot | null;
  /** Páginas por endereço canônico (`menu/seção/página`). */
  pages: Record<string, PublishedPage>;
  /** Previews de componente por par (`componente/variante`); vazio sem previews. */
  previews: Record<string, PublicComponentPreview>;
  /** Design tokens (SYS-130), ou `null` sem nenhum — a mesma regra do `getTokens`. */
  tokens: TokenSet | null;
}
