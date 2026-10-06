/**
 * Problema encontrado nos tokens. `error` tira o token do `TokenSet` (e falha
 * o build); `warning` só avisa. Sem linha e coluna: o JSON é lido inteiro, e o
 * caminho do token já diz onde olhar.
 */
export interface TokenDiagnostic {
  severity: 'error' | 'warning';
  file: string;
  /** Token ou grupo onde está o problema; ausente para erros do arquivo inteiro. */
  path?: string;
  message: string;
}

/** `arquivo  caminho: mensagem` — o formato do `systembook check`. */
export function formatTokenDiagnostic(d: TokenDiagnostic): string {
  const where = d.path ? `${d.path}: ` : '';
  return `${d.file}  ${where}${d.message}`;
}

/** Coletor de diagnósticos de tokens, compartilhado pelas etapas do parser. */
export class TokenDiagnosticBag {
  readonly items: TokenDiagnostic[] = [];

  error(file: string, path: string | undefined, message: string): void {
    this.push('error', file, path, message);
  }

  warning(file: string, path: string | undefined, message: string): void {
    this.push('warning', file, path, message);
  }

  private push(severity: TokenDiagnostic['severity'], file: string, path: string | undefined, message: string) {
    this.items.push(path ? { severity, file, path, message } : { severity, file, message });
  }
}

/**
 * Diagnósticos na ordem dos tokens nos arquivos, não na ordem em que cada etapa
 * os achou. Os sem caminho (erro do arquivo inteiro) vêm antes.
 */
export function sortByTokenOrder(items: readonly TokenDiagnostic[], paths: readonly string[]): TokenDiagnostic[] {
  const order = new Map(paths.map((p, i) => [p, i]));
  const rank = (d: TokenDiagnostic) => (d.path === undefined ? -1 : (order.get(d.path) ?? paths.length));
  return [...items].sort((a, b) => rank(a) - rank(b));
}
