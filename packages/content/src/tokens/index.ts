/**
 * `@systembook/content/tokens`: design tokens em arquivos DTCG → `TokenSet`.
 * Funções puras, sem disco e sem as dependências do parser de `.md/.mdx` —
 * servem à CLI, ao server e à doc pública.
 */
export { formatTokenDiagnostic, TokenDiagnosticBag, type TokenDiagnostic } from './diagnostics.js';
export { parseTokenSources } from './parse.js';
export { DEFAULT_TOKEN_MODE, type ParsedToken, type ParsedTokens, type TokenSource } from './types.js';
