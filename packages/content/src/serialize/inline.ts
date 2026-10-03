import type { TiptapNode } from '../blocks.js';
import { MARK_ORDER } from '../parse/toTiptap.js';

/**
 * Conteúdo inline (texto com marks) → Markdown/MDX (SYS-109). O inverso do
 * `inline()` do parser: o que sai daqui, lido de volta, tem que dar o mesmo
 * JSON. Onde o Markdown não consegue representar o conteúdo, o problema vai
 * para `warn` — nada é perdido em silêncio.
 */

type MarkType = (typeof MARK_ORDER)[number];
type Mark = { type: string; attrs?: Record<string, unknown> };

export interface InlineOptions {
  warn: (message: string) => void;
  /** Célula de tabela: `|` precisa de escape, até dentro de código. */
  inTable?: boolean;
  /** Heading: `#` no fim seria lido como sequência de fechamento. */
  inHeading?: boolean;
}

/** Marks que abrem/fecham com delimitador (o `code` é folha, vira um code span). */
const WRAPPING: readonly MarkType[] = ['link', 'bold', 'italic', 'underline'];

function isKnownMark(type: string): type is MarkType {
  return (MARK_ORDER as readonly string[]).includes(type);
}

function sameMark(a: Mark, b: Mark): boolean {
  return a.type === b.type && JSON.stringify(a.attrs ?? null) === JSON.stringify(b.attrs ?? null);
}

function hasMark(marks: readonly Mark[], mark: Mark): boolean {
  return marks.some((m) => sameMark(m, mark));
}

/** Escape de URL/caminho como destino de link ou imagem. */
export function destination(url: string): string {
  return /[\s<>()]/.test(url) || url === '' ? `<${url.replace(/[<>\\]/g, (c) => `\\${c}`)}>` : url;
}

/** Título de link/legenda de imagem entre aspas. */
export function quotedTitle(title: string): string {
  return `"${title.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

/** Texto de alt/rótulo: só os colchetes e a barra têm sentido ali. */
export function bracketText(text: string): string {
  return text.replace(/[[\]\\]/g, (c) => `\\${c}`);
}

/**
 * Escape do texto puro. Escapa só o que muda o sentido no MDX/GFM, para a
 * saída continuar legível: `_` no meio de palavra (`snake_case`) e `&` que não
 * forma entidade ficam como estão.
 */
function escapeText(text: string, options: InlineOptions): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const prev = text[i - 1];
    const next = text[i + 1];
    if ('\\*`[]<>{}~'.includes(c)) out += `\\${c}`;
    else if (c === '_' && !(prev && next && /[\p{L}\p{N}]/u.test(prev) && /[\p{L}\p{N}]/u.test(next))) out += '\\_';
    else if (c === '&' && /^#?[a-zA-Z0-9]+;/.test(text.slice(i + 1))) out += '\\&';
    else if (c === '|' && options.inTable) out += '\\|';
    else if (c === '\n') out += ' '; // o parser leria a quebra como espaço
    else out += c;
  }
  return out;
}

/** Code span: a cerca é maior que qualquer sequência de crases do conteúdo. */
function codeSpan(text: string, options: InlineOptions): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  // Espaço nas pontas some na leitura se houver nos dois lados; crase na ponta
  // grudaria na cerca.
  const pad = /^`|`$/.test(text) || (/^ /.test(text) && / $/.test(text) && text.trim() !== '') ? ' ' : '';
  const body = options.inTable ? text.replace(/\|/g, '\\|') : text;
  return `${fence}${pad}${body}${pad}${fence}`;
}

const URL_LIKE = /(?:https?:\/\/|www\.)[^\s]|[\w.+-]+@[\w-]+\.[\w.-]*\w/i;

/**
 * Espaço na borda de negrito/itálico impede o delimitador de abrir/fechar
 * (`**a **`). O espaço da borda sai do mark — a não ser que o vizinho daquele
 * lado tenha o mesmo mark, e aí o delimitador nem fica ali.
 */
function splitEdgeWhitespace(nodes: TiptapNode[]): { text: string; marks: Mark[] }[] {
  const out: { text: string; marks: Mark[] }[] = [];
  nodes.forEach((node, i) => {
    const text = node.text ?? '';
    const marks = (node.marks ?? []) as Mark[];
    if (!text) return;
    const isCode = marks.some((m) => m.type === 'code');
    const emphasis = marks.some((m) => m.type === 'bold' || m.type === 'italic');
    if (isCode || !emphasis) {
      out.push({ text, marks });
      return;
    }
    const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];
    const edge = (neighbour: TiptapNode | undefined) => {
      const theirs = (neighbour?.marks ?? []) as Mark[];
      return marks.filter((m) => (m.type !== 'bold' && m.type !== 'italic') || hasMark(theirs, m));
    };
    if (lead) out.push({ text: lead, marks: edge(nodes[i - 1]) });
    if (core) out.push({ text: core, marks });
    if (trail) out.push({ text: trail, marks: edge(nodes[i + 1]) });
  });
  return out;
}

function open(mark: Mark): string {
  switch (mark.type) {
    case 'link':
      return '[';
    case 'bold':
      return '**';
    case 'italic':
      return '*';
    default:
      return '<u>';
  }
}

function close(mark: Mark): string {
  switch (mark.type) {
    case 'link': {
      const href = String(mark.attrs?.href ?? '');
      const title = mark.attrs?.title;
      return `](${destination(href)}${typeof title === 'string' && title ? ` ${quotedTitle(title)}` : ''})`;
    }
    case 'bold':
      return '**';
    case 'italic':
      return '*';
    default:
      return '</u>';
  }
}

const PUNCTUATION = /[\p{P}\p{S}]/u;
const WHITESPACE = /\s/u;

type Delimiter = { at: number; length: number; kind: 'open' | 'close'; mark: string };

/**
 * Regra de "flanking" do CommonMark: `**` colado em letra de um lado e em
 * pontuação do outro (`a**"b"**`) não abre/fecha. Não há escape que resolva,
 * então o caso vira aviso.
 */
function checkFlanking(out: string, delimiters: Delimiter[], warn: (message: string) => void): void {
  for (const d of delimiters) {
    const before = out[d.at - 1];
    const after = out[d.at + d.length];
    const isSpace = (c: string | undefined) => c === undefined || WHITESPACE.test(c);
    const isPunct = (c: string | undefined) => c !== undefined && PUNCTUATION.test(c);
    const ok =
      d.kind === 'open'
        ? !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before))
        : !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
    // Um aviso por trecho: abertura e fechamento do mesmo negrito dariam dois.
    if (!ok) {
      const name = d.mark === 'bold' ? 'negrito' : 'itálico';
      const excerpt = out.slice(Math.max(0, d.at - 15), d.at + d.length + 15).trim();
      warn(`${name} colado em pontuação não tem sintaxe em Markdown e pode se perder: "${excerpt}".`);
      return;
    }
  }
}

/** Serializa uma sequência inline (o `content` de parágrafo, heading ou célula). */
export function serializeInline(nodes: readonly TiptapNode[] | undefined, options: InlineOptions): string {
  const runs: TiptapNode[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'text') {
      const unknown = ((node.marks ?? []) as Mark[]).filter((m) => !isKnownMark(m.type));
      for (const mark of unknown) options.warn(`a formatação "${mark.type}" não existe no formato de arquivo e foi removida.`);
      runs.push(unknown.length ? { ...node, marks: (node.marks as Mark[]).filter((m) => isKnownMark(m.type)) } : node);
    } else {
      options.warn(`o elemento inline "${node.type}" não existe no formato de arquivo e foi removido.`);
    }
  }

  let out = '';
  const stack: Mark[] = [];
  const delimiters: Delimiter[] = [];
  const push = (text: string, mark: Mark, kind: 'open' | 'close') => {
    if (mark.type === 'bold' || mark.type === 'italic') delimiters.push({ at: out.length, length: text.length, kind, mark: mark.type });
    out += text;
  };
  const closeTo = (depth: number) => {
    while (stack.length > depth) {
      const mark = stack.pop()!;
      push(close(mark), mark, 'close');
    }
  };

  for (const run of splitEdgeWhitespace(runs)) {
    const marks = [...run.marks].sort(
      (a, b) => MARK_ORDER.indexOf(a.type as MarkType) - MARK_ORDER.indexOf(b.type as MarkType),
    );
    const wanted = marks.filter((m) => (WRAPPING as readonly string[]).includes(m.type));
    let keep = 0;
    while (keep < stack.length && keep < wanted.length && sameMark(stack[keep]!, wanted[keep]!)) keep++;
    closeTo(keep);
    for (const mark of wanted.slice(keep)) {
      push(open(mark), mark, 'open');
      stack.push(mark);
    }
    if (marks.some((m) => m.type === 'code')) out += codeSpan(run.text, options);
    else {
      if (!stack.some((m) => m.type === 'link') && URL_LIKE.test(run.text)) {
        const match = URL_LIKE.exec(run.text)![0];
        options.warn(`o texto "${match}…" vira link no arquivo: o Markdown transforma URLs e e-mails soltos em link.`);
      }
      out += escapeText(run.text, options);
    }
  }
  closeTo(0);
  checkFlanking(out, delimiters, options.warn);

  // Começo de linha: o que abriria outro bloco (heading, citação, lista, linha
  // horizontal) é escapado.
  out = out.replace(/^([#>+=-])/, '\\$1').replace(/^(\d+)([.)])/, '$1\\$2');
  // Espaço nas pontas do bloco some na leitura; como entidade, fica.
  out = out.replace(/^[ \t]+|[ \t]+$/g, (ws) => [...ws].map((c) => (c === ' ' ? '&#32;' : '&#9;')).join(''));
  if (options.inHeading) out = out.replace(/(?<!\\)(#+)$/, '\\$1');
  return out;
}
