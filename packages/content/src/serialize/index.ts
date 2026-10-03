import { stringify as stringifyYaml } from 'yaml';
import type { DosDontsCover } from '@systembook/schema';
import { blocksToTiptapDoc, codeText, type BlockData, type TiptapDoc, type TiptapNode } from '../blocks.js';
import { bracketText, destination, quotedTitle, serializeInline, type InlineOptions } from './inline.js';

/**
 * Serializer (SYS-109): doc Tiptap / blocos do CMS → arquivo `.mdx` no formato
 * de `docs/static-format.md`. É o inverso do `parseDocument`: o arquivo gerado,
 * lido de volta, dá os mesmos blocos (o teste de round-trip cobre todos os
 * tipos).
 *
 * O CMS aceita algumas construções que o formato de arquivo não tem (conteúdo
 * de bloco em célula de tabela, embed sem variante, heading de nível 4…). Elas
 * são simplificadas para o equivalente mais próximo e cada simplificação vira
 * um aviso em `warnings`: nada se perde em silêncio. Parágrafos vazios são a
 * única exceção — o Markdown não tem como representá-los e eles não aparecem
 * na página.
 */

export interface SerializeOptions {
  /** Frontmatter do arquivo, na ordem das chaves; `undefined`/`null` ficam de fora. */
  frontmatter?: Record<string, unknown> | null;
}

export interface SerializedDocument {
  /** Conteúdo do arquivo `.mdx`, terminado em uma quebra de linha. */
  source: string;
  /** O que precisou ser simplificado para caber no formato. */
  warnings: string[];
}

interface Context {
  warn: (message: string) => void;
}

const INDENT = '  ';

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line ? prefix + line : line))
    .join('\n');
}

/** Valor de prop JSX entre aspas. O MDX decodifica entidades em props. */
function jsxProp(name: string, value: string): string {
  const safe = value.replace(/&(?=#?[a-zA-Z0-9]+;)/g, '&amp;');
  if (!safe.includes('"')) return `${name}="${safe}"`;
  if (!safe.includes("'")) return `${name}='${safe}'`;
  return `${name}="${safe.replace(/"/g, '&quot;')}"`;
}

function heading(node: TiptapNode, ctx: Context): string {
  let level = Math.max(1, Number(node.attrs?.level) || 1);
  if (level > 3) {
    ctx.warn(`heading de nível ${level} virou nível 3: o formato de arquivo vai até ###.`);
    level = 3;
  }
  const text = serializeInline(node.content, { warn: ctx.warn, inHeading: true });
  return text ? `${'#'.repeat(level)} ${text}` : '#'.repeat(level);
}

function codeBlock(node: TiptapNode, ctx: Context): string {
  const code = codeText(node);
  let language = (node.attrs?.language as string | null | undefined) ?? '';
  if (/[\s`]/.test(language)) {
    ctx.warn(`a linguagem "${language}" do bloco de código foi removida: o formato não aceita espaço ou crase no nome.`);
    language = '';
  }
  const longest = Math.max(0, ...(code.match(/`{3,}/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return code ? `${fence}${language}\n${code}\n${fence}` : `${fence}${language}\n${fence}`;
}

function image(node: TiptapNode, ctx: Context): string | null {
  const src = String(node.attrs?.src ?? '');
  if (!src) {
    ctx.warn('imagem sem endereço foi removida.');
    return null;
  }
  const alt = String(node.attrs?.alt ?? '');
  const caption = node.attrs?.caption;
  const title = typeof caption === 'string' && caption ? ` ${quotedTitle(caption)}` : '';
  return `![${bracketText(alt)}](${destination(src)}${title})`;
}

/** Marcador de cada item; listas vizinhas alternam o caractere para não se fundirem. */
function list(node: TiptapNode, ctx: Context, alternate: boolean): string | null {
  const ordered = node.type === 'orderedList';
  const start = Number(node.attrs?.start ?? 1);
  if (ordered && node.attrs?.type) {
    ctx.warn(`a numeração "${String(node.attrs.type)}" da lista virou números: o formato de arquivo só numera com algarismos.`);
  }
  const items: string[] = [];
  for (const item of node.content ?? []) {
    const [first, ...rest] = item.content ?? [];
    const lead = first?.type === 'paragraph' ? serializeInline(first.content, ctx) : '';
    if (!lead) {
      ctx.warn('item de lista sem texto no início foi removido, com o que havia dentro dele: no arquivo, todo item começa com um parágrafo.');
      continue;
    }
    const marker = ordered ? `${start + items.length}${alternate ? ')' : '.'}` : alternate ? '*' : '-';
    const body = blockSequence(rest, ctx);
    const pad = ' '.repeat(marker.length + 1);
    const separator = rest[0] && isList(rest[0]) ? '\n' : '\n\n';
    items.push(`${marker} ${lead}${body ? separator + indent(body, pad) : ''}`);
  }
  return items.length ? items.join('\n') : null;
}

function isList(node: TiptapNode): boolean {
  return node.type === 'bulletList' || node.type === 'orderedList';
}

function cellText(cell: TiptapNode, ctx: Context): string {
  const blocks = cell.content ?? [];
  const inline: InlineOptions = { warn: ctx.warn, inTable: true };
  if (blocks.length <= 1 && (blocks[0]?.type ?? 'paragraph') === 'paragraph') {
    return serializeInline(blocks[0]?.content, inline);
  }
  ctx.warn('célula de tabela com mais que texto virou texto corrido: no arquivo, a célula só aceita texto com formatação e links.');
  const parts: string[] = [];
  const collect = (nodes: readonly TiptapNode[]) => {
    for (const node of nodes) {
      if (node.type === 'paragraph' || node.type === 'heading') parts.push(serializeInline(node.content, inline));
      else if (node.type === 'codeBlock') {
        const code = codeText(node).replace(/\n/g, ' ');
        if (code) parts.push(serializeInline([{ type: 'text', text: code, marks: [{ type: 'code' }] }], inline));
      } else collect(node.content ?? []);
    }
  };
  collect(blocks);
  return parts.filter(Boolean).join(' ');
}

function table(node: TiptapNode, ctx: Context): string | null {
  const rows = node.content ?? [];
  if (!rows.length) return null;
  let hasMergedCells = false;
  let hasColumnWidths = false;
  let hasHeaderOutsideFirstRow = false;
  const cells = rows.map((row, r) =>
    (row.content ?? []).map((cell) => {
      if (Number(cell.attrs?.colspan ?? 1) > 1 || Number(cell.attrs?.rowspan ?? 1) > 1) hasMergedCells = true;
      if (cell.attrs?.colwidth) hasColumnWidths = true;
      if (r > 0 && cell.type === 'tableHeader') hasHeaderOutsideFirstRow = true;
      return cellText(cell, ctx);
    }),
  );
  if ((rows[0]!.content ?? []).some((cell) => cell.type !== 'tableHeader')) {
    ctx.warn('tabela sem linha de cabeçalho: no arquivo, a primeira linha vira o cabeçalho.');
  }
  if (hasHeaderOutsideFirstRow) ctx.warn('célula de cabeçalho fora da primeira linha virou célula comum.');
  if (hasMergedCells) ctx.warn('células mescladas da tabela foram separadas: o formato de arquivo não mescla células.');
  // O GFM alinha a coluna inteira pelo cabeçalho; a leitura copia esse
  // alinhamento para todas as células da coluna.
  const columnAlign = (rows[0]!.content ?? []).map((cell) => cell.attrs?.align ?? null);
  if (rows.some((row) => (row.content ?? []).some((cell, c) => (cell.attrs?.align ?? null) !== (columnAlign[c] ?? null)))) {
    ctx.warn('o alinhamento de células da tabela virou o da coluna: no arquivo, o alinhamento vem do cabeçalho.');
  }
  if (hasColumnWidths) ctx.warn('as larguras de coluna da tabela não são guardadas no arquivo.');

  const columns = Math.max(...cells.map((row) => row.length));
  const align = Array.from({ length: columns }, (_, c) => columnAlign[c] ?? null);
  const width = Array.from({ length: columns }, (_, c) =>
    Math.max(3, ...cells.map((row) => [...(row[c] ?? '')].length)),
  );
  const line = (row: string[]) =>
    `| ${Array.from({ length: columns }, (_, c) => (row[c] ?? '').padEnd(width[c]!)).join(' | ')} |`;
  const rule = width.map((w, c) => {
    const a = align[c];
    if (a === 'center') return `:${'-'.repeat(w - 2)}:`;
    if (a === 'right') return `${'-'.repeat(w - 1)}:`;
    if (a === 'left') return `:${'-'.repeat(w - 1)}`;
    return '-'.repeat(w);
  });
  return [line(cells[0]!), `| ${rule.join(' | ')} |`, ...cells.slice(1).map(line)].join('\n');
}

/** Componente de bloco com conteúdo: tags em linhas próprias, corpo indentado. */
function container(openTag: string, name: string, children: readonly TiptapNode[], ctx: Context): string | null {
  const body = blockSequence(children, ctx);
  if (!body) return null;
  return `${openTag}\n${indent(body, INDENT)}\n</${name}>`;
}

function callout(node: TiptapNode, ctx: Context): string | null {
  const variant = String(node.attrs?.variant ?? 'info');
  const tag = variant === 'info' ? '<Callout>' : `<Callout ${jsxProp('variant', variant)}>`;
  const out = container(tag, 'Callout', node.content ?? [], ctx);
  if (!out) ctx.warn('callout vazio foi removido.');
  return out;
}

function componentEmbed(node: TiptapNode, ctx: Context): string | null {
  const component = String(node.attrs?.componentName ?? '');
  const variant = node.attrs?.variantId as string | null | undefined;
  if (!component || !variant) {
    ctx.warn(
      component
        ? `o embed do componente "${component}" sem variante escolhida foi removido: no arquivo, a variante é obrigatória.`
        : 'embed de componente sem componente escolhido foi removido.',
    );
    return null;
  }
  return `<ComponentEmbed ${jsxProp('component', component)} ${jsxProp('variant', variant)} />`;
}

function dosDonts(node: TiptapNode, ctx: Context): string | null {
  const title = String(node.attrs?.titulo ?? '');
  const props = [jsxProp('variant', String(node.attrs?.variant ?? 'do'))];
  if (title) props.push(jsxProp('title', title));
  const cover = node.attrs?.cover as DosDontsCover | null | undefined;
  if (cover?.kind === 'image' && cover.src) {
    let alt = cover.alt;
    if (!alt.trim()) {
      alt = title || 'Imagem';
      ctx.warn(`o cover do do/don't "${title}" não tinha texto alternativo e recebeu "${alt}": no arquivo, coverAlt é obrigatório.`);
    }
    props.push(jsxProp('coverImage', cover.src), jsxProp('coverAlt', alt));
  } else if (cover?.kind === 'component-embed' && cover.componentName && cover.variantId) {
    props.push(jsxProp('coverComponent', cover.componentName), jsxProp('coverVariant', cover.variantId));
  } else if (cover) {
    ctx.warn(`o cover do do/don't "${title}" foi removido: o componente ou a variante não estavam escolhidos.`);
  }
  const out = container(`<DosDonts ${props.join(' ')}>`, 'DosDonts', node.content ?? [], ctx);
  if (!out) ctx.warn(`o do/don't "${title}" sem descrição foi removido: no arquivo, a descrição é obrigatória.`);
  return out;
}

function block(node: TiptapNode, ctx: Context, alternateList: boolean): string | null {
  switch (node.type) {
    case 'heading':
      return heading(node, ctx);
    case 'paragraph':
      return serializeInline(node.content, ctx) || null;
    case 'bulletList':
    case 'orderedList':
      return list(node, ctx, alternateList);
    case 'codeBlock':
      return codeBlock(node, ctx);
    case 'image':
      return image(node, ctx);
    case 'table':
      return table(node, ctx);
    case 'callout':
      return callout(node, ctx);
    case 'componentEmbed':
      return componentEmbed(node, ctx);
    case 'dosDonts':
      return dosDonts(node, ctx);
    default:
      ctx.warn(`o bloco "${node.type}" não existe no formato de arquivo e foi removido.`);
      return null;
  }
}

/**
 * Blocos separados por linha em branco. Duas listas do mesmo tipo seguidas
 * alternam o marcador (`-`/`*`, `.`/`)`), senão o Markdown as juntaria numa só.
 */
function blockSequence(nodes: readonly TiptapNode[], ctx: Context): string {
  const parts: string[] = [];
  let previousType: string | null = null;
  let previousAlternate = false;
  for (const node of nodes) {
    const alternate: boolean = previousType === node.type && isList(node) && !previousAlternate;
    const out = block(node, ctx, alternate);
    if (out === null) continue;
    previousType = node.type;
    previousAlternate = alternate;
    parts.push(out);
  }
  return parts.join('\n\n');
}

function frontmatterBlock(frontmatter: Record<string, unknown>): string {
  const entries = Object.entries(frontmatter).filter(([, value]) => value !== undefined && value !== null);
  if (!entries.length) return '';
  return `---\n${stringifyYaml(Object.fromEntries(entries), { lineWidth: 0 })}---\n`;
}

/** Doc Tiptap (o formato do editor e do parser) → arquivo `.mdx`. */
export function serializeDocument(doc: TiptapDoc, options: SerializeOptions = {}): SerializedDocument {
  const warnings: string[] = [];
  const ctx: Context = { warn: (message) => warnings.push(message) };
  const body = blockSequence(doc.content ?? [], ctx);
  const head = options.frontmatter ? frontmatterBlock(options.frontmatter) : '';
  const source = head && body ? `${head}\n${body}\n` : head || (body ? `${body}\n` : '');
  return { source, warnings };
}

/** Blocos de uma tab (como o snapshot de revisão guarda) → arquivo `.mdx`. */
export function serializeBlocks(
  blocks: readonly (BlockData & { ordem: number })[],
  options: SerializeOptions = {},
): SerializedDocument {
  return serializeDocument(blocksToTiptapDoc(blocks), options);
}
