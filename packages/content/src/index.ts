/**
 * `@systembook/content`: o conteúdo do SystemBook em arquivos. O formato está
 * em `docs/static-format.md`; o mapeamento nó ↔ bloco também sai sozinho em
 * `@systembook/content/blocks`, sem as dependências do parser.
 */
export * from './blocks.js';
export { formatDiagnostic, type Diagnostic } from './diagnostics.js';
export {
  landingFrontmatterSchema,
  pageFrontmatterSchema,
  tabFrontmatterSchema,
  type DocumentKind,
  type FrontmatterFor,
  type LandingFrontmatter,
  type PageFrontmatter,
  type TabFrontmatter,
} from './frontmatter.js';
export {
  parseDocument,
  type ContentReferences,
  type SourcePoint,
  type ParsedDocument,
  type ParseOptions,
} from './parse/index.js';
export { MARK_ORDER, normalizeLanguage } from './parse/toTiptap.js';
