/**
 * Problema encontrado no conteúdo, com a posição (1-based) no arquivo. O parser
 * coleta todos em vez de parar no primeiro: quem escreve a doc corrige tudo de
 * uma vez (`docs/static-format.md`, "Erros").
 */
export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
}

/** `arquivo:linha:coluna  mensagem` — o formato do `systembook check`. */
export function formatDiagnostic(d: Diagnostic): string {
  return `${d.file}:${d.line}:${d.column}  ${d.message}`;
}

/** Posição de um nó mdast/unist (`position.start`), ou o início do arquivo. */
export interface PointLike {
  line: number;
  column: number;
}

export interface Positioned {
  position?: { start: PointLike } | undefined;
}

/** Coletor de diagnósticos de um arquivo. */
export class DiagnosticBag {
  readonly items: Diagnostic[] = [];

  constructor(readonly file: string) {}

  /** Registra um problema na posição do nó (ou no início do arquivo). */
  report(node: Positioned | PointLike | undefined, message: string): void {
    const point =
      node && 'line' in node ? node : (node?.position?.start ?? { line: 1, column: 1 });
    this.items.push({ file: this.file, line: point.line, column: point.column, message });
  }
}

/** Distância de edição (Levenshtein), para sugerir "quis dizer …?". */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/** Sufixo ` (quis dizer "x"?)` quando há um candidato próximo o bastante. */
export function didYouMean(value: string, candidates: readonly string[]): string {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = distance(value.toLowerCase(), c.toLowerCase());
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best && bestDistance <= 2 ? ` (quis dizer "${best}"?)` : '';
}
