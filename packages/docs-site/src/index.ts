/**
 * `@systembook/docs-site` (SYS-90): a documentação pública do Systembook e a
 * camada de renderização de conteúdo, independentes de onde o conteúdo vem.
 *
 * Quem monta o site fornece um `DocsDataSource` (contrato em
 * `@systembook/schema`) por `DocsDataSourceProvider`, um `QueryClient` do
 * TanStack Query e um router do React Router. Os estilos são importados à
 * parte: `@systembook/docs-site/content.css` (conteúdo) e
 * `@systembook/docs-site/public.css` (shell da doc pública).
 */

// Fonte de dados e leituras
export { DocsDataSourceProvider, useDocsDataSource } from './content/dataSource.js';
export {
  docsQueryKeys,
  hasPreviewSelection,
  useComponentPreview,
  useLanding,
  useNavTree,
  usePageById,
  usePageBySlug,
  usePublicSearch,
  usePublicSettings,
  useResolvedPath,
} from './content/docsQueries.js';

export { createStaticDataSource, type StaticDataSourceOptions } from './static/staticDataSource.js';

// Conteúdo: extensões Tiptap, nós e utilitários
export { createContentExtensions, contentExtensions } from './content/extensions.js';
export {
  CALLOUT_META,
  CALLOUT_VARIANTS,
  type CalloutOptions,
  type VariantSwitcherProps,
} from './content/nodes/Callout.js';
export {
  LANGUAGES,
  type CodeBlockOptions,
  type CodeLanguageSelectProps,
} from './content/nodes/CodeBlock.js';
export type {
  ComponentEmbedEditControlsProps,
  ComponentEmbedOptions,
  ComponentEmbedState,
} from './content/nodes/ComponentEmbed.js';
export {
  DOS_DONTS_META,
  DOS_DONTS_VARIANTS,
  type DosDontsOptions,
  type DosDontsTitleFieldProps,
} from './content/nodes/DosDonts.js';
export { EmbedCoverPreview, type DosDontsCoverFieldProps } from './content/nodes/DosDontsCover.js';
export { blocksToTiptapDoc } from './content/blocksToTiptapDoc.js';

// Design tokens
export { TokenTable, type TokenTableProps } from './content/tokens/TokenTable.js';
export { ColorTokens } from './content/tokens/ColorTokens.js';
export { TypographyTokens } from './content/tokens/TypographyTokens.js';

// Doc pública
export { PageRenderer, BODY_VIEW_LABEL, bodyViewLabel, type RenderableSnapshot } from './public/PageRenderer.js';
export { PublicLayout, type PublicOutletContext } from './public/PublicLayout.js';
export { PublicHome } from './public/PublicHome.js';
export { PublicPageView } from './public/PublicPageView.js';
export { PublicPageById } from './public/PublicPageById.js';
export { LegacyDocsRedirect } from './public/LegacyDocsRedirect.js';
export { DocsRoutesProvider, useDocsPaths, type DocsPaths } from './public/docsRoutes.js';
export { createDocsRoute } from './public/createDocsRoute.js';
export { InlineMarkdown } from './public/InlineMarkdown.js';
export { TableOfContents } from './public/TableOfContents.js';
export { useHeadingIds } from './public/useHeadingIds.js';
export { useTheme } from './public/useTheme.js';
