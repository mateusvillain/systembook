/**
 * `@systembook/content/site`: os caminhos dos dados do site estático e a
 * consulta ao índice de busca, sem as dependências do parser — é o que o
 * `staticDataSource` da doc pública importa.
 */
export { pageKey, parsePageKey, previewKey, sitePath, STATIC_DATA_DIR, staticDataPaths } from './paths.js';
export { loadSearchIndex, querySearchIndex, type SearchIndex, type SearchIndexJson } from './search.js';
