import type { TokenModeValue, TokenValue } from '@systembook/schema';
import type { TokenDiagnostic } from './diagnostics.js';

/** Modo único de um conjunto sem arquivos por modo. */
export const DEFAULT_TOKEN_MODE = 'default';

/**
 * Um arquivo de tokens DTCG. Quem chama lê o arquivo — este módulo não toca o
 * disco, para servir também ao server e ao navegador.
 */
export interface TokenSource {
  /** Caminho do arquivo, só para os diagnósticos. */
  file: string;
  /** Conteúdo JSON do arquivo. */
  content: string;
  /**
   * Modo que o arquivo define (`dark`, `brand-b`). Sem modo, é um arquivo
   * base: vale para todos os modos, e os arquivos de modo o sobrepõem.
   */
  mode?: string;
}

/**
 * Token como sai do parser: valores por modo já sobrepostos, mas sem aliases
 * resolvidos e com o `$type` ainda não validado (pode faltar, quando o token
 * é um alias sem tipo declarado).
 *
 * `type`, `description` e `deprecated` são do token, não do modo: vale a
 * última definição que traz o campo, na ordem dos arquivos.
 */
export interface ParsedToken {
  path: string;
  type?: string;
  description?: string;
  deprecated?: boolean | string;
  /** Valor como está no arquivo, com uma chave para cada modo do conjunto. */
  byMode: Record<string, TokenValue>;
  /** Arquivo da primeira definição do token, para os diagnósticos. */
  file: string;
}

/**
 * Token com os aliases resolvidos em cada modo. O `type` ainda é o texto do
 * arquivo (ou o herdado pelo alias) — a validação o confere depois.
 */
export interface ResolvedToken extends Omit<ParsedToken, 'byMode'> {
  byMode: Record<string, TokenModeValue>;
}

export interface ParsedTokens {
  /** Modos na ordem das fontes; `["default"]` sem arquivos de modo. */
  modes: string[];
  tokens: ParsedToken[];
  diagnostics: TokenDiagnostic[];
}
