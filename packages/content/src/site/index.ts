/**
 * `@systembook/content/site`: os caminhos dos dados do site estático, os
 * caminhos por idioma e a consulta ao índice de busca, sem as dependências do parser — é o que o
 * `staticDataSource` da doc pública importa.
 */
export { pageKey, parsePageKey, previewKey, sitePath, STATIC_DATA_DIR, staticDataPaths, TOKENS_SEGMENT } from './paths.js';
export {
  hreflangLinks,
  isLocaleCode,
  localeSegment,
  localePrefix,
  localizedHomePath,
  localizedSitePath,
  splitLocalePrefix,
  type HreflangLink,
  type LocalePathMatch,
} from './locale.js';
export { loadSearchIndex, querySearchIndex, type SearchIndex, type SearchIndexJson } from './search.js';
