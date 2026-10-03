import type { TiptapNode } from '../blocks.js';
import { parseDocument } from '../parse/index.js';
import { MARK_ORDER, type MarkType } from '../parse/toTiptap.js';

/**
 * Conteúdo inline (texto com marks) → Markdown/MDX (SYS-109). O inverso do
 * `inline()` do parser: o que sai daqui, lido de volta, tem que dar o mesmo
 * JSON. Onde o Markdown não consegue representar o conteúdo, o problema vai
 * para `warn` — nada é perdido em silêncio.
 */

/** Mark como vem do CMS: pode ter tipo que o formato não conhece. */
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

function isEmphasis(mark: Mark): boolean {
  return mark.type === 'bold' || mark.type === 'italic';
}

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
  return /[\s<>()\\]/.test(url) || url === '' ? `<${url.replace(/[<>\\]/g, (c) => `\\${c}`)}>` : url;
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
function splitEdgeWhitespace(nodes: TiptapNode[]): Run[] {
  const out: Run[] = [];
  nodes.forEach((node, i) => {
    const text = node.text ?? '';
    const marks = (node.marks ?? []) as Mark[];
    if (!text) return;
    const isCode = marks.some((m) => m.type === 'code');
    const emphasis = marks.some(isEmphasis);
    if (isCode || !emphasis) {
      out.push({ text, marks });
      return;
    }
    const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];
    const keptAtEdge = (neighbour: TiptapNode | undefined) => {
      const theirs = (neighbour?.marks ?? []) as Mark[];
      return marks.filter((m) => !isEmphasis(m) || hasMark(theirs, m));
    };
    if (lead) out.push({ text: lead, marks: keptAtEdge(nodes[i - 1]) });
    if (core) out.push({ text: core, marks });
    if (trail) out.push({ text: trail, marks: keptAtEdge(nodes[i + 1]) });
  });
  return out;
}

/** Delimitadores de abertura e fechamento; o fechamento do link leva o destino. */
const DELIMITERS: Record<Exclude<MarkType, 'link' | 'code'>, [string, string]> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  underline: ['<u>', '</u>'],
};

function open(mark: Mark): string {
  return mark.type === 'link' ? '[' : DELIMITERS[mark.type as keyof typeof DELIMITERS][0];
}

function close(mark: Mark): string {
  if (mark.type !== 'link') return DELIMITERS[mark.type as keyof typeof DELIMITERS][1];
  const href = String(mark.attrs?.href ?? '');
  const title = mark.attrs?.title;
  return `](${destination(href)}${typeof title === 'string' && title ? ` ${quotedTitle(title)}` : ''})`;
}

type Run = { text: string; marks: Mark[] };

function sortMarks(marks: readonly Mark[]): Mark[] {
  return [...marks].sort((a, b) => MARK_ORDER.indexOf(a.type as MarkType) - MARK_ORDER.indexOf(b.type as MarkType));
}

/**
 * Escreve os runs como Markdown. `italic` escolhe o delimitador do itálico:
 * `*` é o padrão; `_` é a alternativa quando o `*` encosta em outro delimitador
 * e o CommonMark junta os dois numa sequência só (`*a***b**`).
 */
function render(runs: readonly Run[], options: InlineOptions, italic: '*' | '_'): string {
  let out = '';
  const stack: Mark[] = [];
  const closeTo = (depth: number) => {
    while (stack.length > depth) {
      const mark = stack.pop()!;
      out += mark.type === 'italic' ? italic : close(mark);
    }
  };

  for (const run of runs) {
    const marks = sortMarks(run.marks);
    const wanted = marks.filter((m) => (WRAPPING as readonly string[]).includes(m.type));
    let shared = 0;
    while (shared < stack.length && shared < wanted.length && sameMark(stack[shared]!, wanted[shared]!)) shared++;
    closeTo(shared);
    for (const mark of wanted.slice(shared)) {
      // `![` abriria uma imagem: o `!` do texto antes do link precisa de escape.
      if (mark.type === 'link' && /(^|[^\\])!$/.test(out)) out = `${out.slice(0, -1)}\\!`;
      out += mark.type === 'italic' ? italic : open(mark);
      stack.push(mark);
    }
    out += marks.some((m) => m.type === 'code') ? codeSpan(run.text, options) : escapeText(run.text, options);
  }
  closeTo(0);

  // Começo de linha: o que abriria outro bloco (heading, citação, lista, linha
  // horizontal) é escapado.
  out = out.replace(/^([#>+=-])/, '\\$1').replace(/^(\d+)([.)])/, '$1\\$2');
  // Espaço nas pontas do bloco some na leitura; como entidade, fica.
  out = out.replace(/^[ \t]+|[ \t]+$/g, (ws) => [...ws].map((c) => (c === ' ' ? '&#32;' : '&#9;')).join(''));
  if (options.inHeading) out = out.replace(/(?<!\\)(#+)$/, '\\$1');
  return out;
}

/** O conteúdo inline que o parser tem que devolver para `runs`. */
function expected(runs: readonly Run[]): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const run of runs) {
    const marks = sortMarks(run.marks).map((m) =>
      m.type === 'link'
        ? {
            type: 'link',
            attrs: {
              href: String(m.attrs?.href ?? ''),
              target: '_blank',
              rel: 'noopener noreferrer nofollow',
              class: null,
              title: (m.attrs?.title as string | null | undefined) || null,
            },
          }
        : { type: m.type },
    );
    const text = run.text.replace(/\n/g, ' ');
    const last = out[out.length - 1];
    if (last && sameJson(last.marks ?? [], marks)) last.text += text;
    else out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
  }
  return out;
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Lê o trecho de volta com o parser, no mesmo contexto em que ele vai ficar. */
function readsBackAs(out: string, want: TiptapNode[], options: InlineOptions): boolean {
  const source = options.inTable ? `| ${out} |\n| --- |` : options.inHeading ? `# ${out}` : out;
  const { doc, diagnostics } = parseDocument(source, { file: 'trecho.mdx', format: 'mdx', kind: 'landing' });
  if (diagnostics.length) return false;
  const block = doc.content?.[0];
  const inline = options.inTable ? block?.content?.[0]?.content?.[0]?.content?.[0]?.content : block?.content;
  return sameJson(inline ?? [], want);
}

/**
 * Serializa uma sequência inline (o `content` de parágrafo, heading ou célula).
 * A saída é conferida lendo-a de volta: o que não volta igual vira aviso, então
 * "sem aviso" garante "sem perda".
 */
export function serializeInline(nodes: readonly TiptapNode[] | undefined, options: InlineOptions): string {
  const known: TiptapNode[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'text') {
      const unknown = ((node.marks ?? []) as Mark[]).filter((m) => !isKnownMark(m.type));
      for (const mark of unknown) options.warn(`a formatação "${mark.type}" não existe no formato de arquivo e foi removida.`);
      known.push(unknown.length ? { ...node, marks: (node.marks as Mark[]).filter((m) => isKnownMark(m.type)) } : node);
    } else {
      options.warn(`o elemento inline "${node.type}" não existe no formato de arquivo e foi removido.`);
    }
  }
  const runs = splitEdgeWhitespace(known);
  if (!runs.length) return '';

  const want = expected(runs);
  const first = render(runs, options, '*');
  if (readsBackAs(first, want, options)) return first;
  const alternative = render(runs, options, '_');
  if (readsBackAs(alternative, want, options)) return alternative;

  const url = runs.find((run) => !run.marks.some((m) => m.type === 'link' || m.type === 'code') && URL_LIKE.test(run.text));
  options.warn(
    url
      ? `o texto "${URL_LIKE.exec(url.text)![0]}" vira link no arquivo: o Markdown transforma URLs e e-mails soltos em link.`
      : `o trecho "${first.length > 60 ? `${first.slice(0, 60)}…` : first}" não tem representação exata em Markdown (formatação colada em pontuação ou em outra formatação) e pode mudar na leitura.`,
  );
  return first;
}
