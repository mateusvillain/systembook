import type {
  Code,
  Heading,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
} from 'mdast';
import type { TiptapNode } from '../blocks.js';
import type { DiagnosticBag, Positioned } from '../diagnostics.js';

/**
 * mdast → nós Tiptap (SYS-93), no formato **canônico** que o editor do CMS
 * produz: os mesmos nós, attrs com os valores padrão explícitos, marks na ordem
 * do schema e texto adjacente com os mesmos marks fundido. O teste de
 * round-trip do `@systembook/docs-site` confere isso contra o schema real.
 *
 * Tudo que o CMS não representa vira diagnóstico — nada é descartado em
 * silêncio (`docs/static-format.md`).
 */

/** Referências que o resto do pipeline resolve (arquivos, páginas). */
export interface ContentReferences {
  images: { src: string; node: Positioned }[];
  links: { href: string; node: Positioned }[];
}

export interface ConvertContext {
  bag: DiagnosticBag;
  refs: ContentReferences;
}

/** Apelidos de linguagem → nome registrado no realce de sintaxe do renderer. */
const LANGUAGE_ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  html: 'xml',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
};

export function normalizeLanguage(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const lower = lang.toLowerCase();
  return LANGUAGE_ALIASES[lower] ?? lower;
}

/** Ordem dos marks no schema (= ordem das extensões em `createContentExtensions`). */
const MARK_RANK = ['bold', 'italic', 'underline', 'link', 'code'] as const;
type MarkType = (typeof MARK_RANK)[number];
type Mark = { type: MarkType; attrs?: Record<string, unknown> };

/** Attrs que o mark `link` do Tiptap grava (padrões de `@tiptap/extension-link`). */
function linkMark(href: string, title: string | null | undefined): Mark {
  return {
    type: 'link',
    attrs: {
      href,
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
      class: null,
      title: title ?? null,
    },
  };
}

function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => MARK_RANK.indexOf(a.type) - MARK_RANK.indexOf(b.type));
}

function sameMarks(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Funde texto adjacente com os mesmos marks, como o ProseMirror faz. */
function mergeText(nodes: TiptapNode[]): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (last && last.type === 'text' && node.type === 'text' && sameMarks(last.marks, node.marks)) {
      last.text = (last.text ?? '') + (node.text ?? '');
    } else {
      out.push({ ...node });
    }
  }
  return out;
}

/** Nó mdast que este módulo não conhece pelo tipo (MDX, extensões). */
type AnyNode = { type: string } & Positioned;

const UNSUPPORTED_BLOCK: Record<string, string> = {
  blockquote: 'citação (`>`) não é suportada — use <Callout>.',
  thematicBreak: 'linha horizontal (`---`) não é suportada — use um heading para separar o conteúdo.',
  html: 'HTML não é suportado — use Markdown ou os componentes <Callout>, <ComponentEmbed>, <DosDonts> e <u>.',
  definition: 'definição de link não é suportada — escreva o link no próprio texto: [texto](url).',
  footnoteDefinition: 'nota de rodapé não é suportada.',
  mdxjsEsm: '`import`/`export` não são permitidos em .mdx — o conteúdo é analisado, não executado.',
  mdxFlowExpression: 'expressões `{…}` não são permitidas em .mdx.',
};

const UNSUPPORTED_INLINE: Record<string, string> = {
  break: 'quebra de linha forçada não é suportada — use um parágrafo novo.',
  delete: 'texto tachado (`~~`) não é suportado.',
  html: 'HTML não é suportado — use Markdown (ou <u> em .mdx para sublinhado).',
  footnoteReference: 'nota de rodapé não é suportada.',
  linkReference: 'link por referência não é suportado — escreva [texto](url).',
  imageReference: 'imagem por referência não é suportada — escreva ![alt](caminho).',
  mdxTextExpression: 'expressões `{…}` não são permitidas em .mdx.',
};

function inline(
  nodes: PhrasingContent[],
  marks: Mark[],
  ctx: ConvertContext,
): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        // Quebra simples dentro do parágrafo vira espaço (Markdown padrão).
        const text = node.value.replace(/\s*\n\s*/g, ' ');
        if (text) out.push(marks.length ? { type: 'text', text, marks: sortMarks(marks) } : { type: 'text', text });
        break;
      }
      case 'strong':
        out.push(...inline(node.children, [...marks, { type: 'bold' }], ctx));
        break;
      case 'emphasis':
        out.push(...inline(node.children, [...marks, { type: 'italic' }], ctx));
        break;
      case 'inlineCode':
        // O mark `code` do conteúdo convive com os outros (ver `createContentExtensions`):
        // `[`Button`](./button.mdx)` é link + código.
        if (node.value) {
          out.push({ type: 'text', text: node.value, marks: sortMarks([...marks, { type: 'code' }]) });
        }
        break;
      case 'link':
        if (marks.some((m) => m.type === 'link')) {
          ctx.bag.report(node, 'link dentro de link não é suportado.');
          break;
        }
        ctx.refs.links.push({ href: node.url, node });
        out.push(...inline(node.children, [...marks, linkMark(node.url, node.title)], ctx));
        break;
      case 'image':
        ctx.bag.report(
          node,
          'imagem no meio do texto não é suportada — deixe a imagem sozinha num parágrafo (ela vira um bloco).',
        );
        break;
      default: {
        const message = UNSUPPORTED_INLINE[(node as AnyNode).type];
        ctx.bag.report(node, message ?? `elemento "${(node as AnyNode).type}" não é suportado.`);
      }
    }
  }
  return mergeText(out);
}

/** Parágrafo cujo único conteúdo (fora espaços) é uma imagem. */
function soloImage(node: Paragraph) {
  const meaningful = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  const [only] = meaningful;
  return meaningful.length === 1 && only?.type === 'image' ? only : null;
}

function heading(node: Heading, ctx: ConvertContext): TiptapNode | null {
  if (node.depth > 3) {
    ctx.bag.report(node, `heading de nível ${node.depth} não é suportado — use até ###.`);
    return null;
  }
  const content = inline(node.children, [], ctx);
  return content.length
    ? { type: 'heading', attrs: { level: node.depth }, content }
    : { type: 'heading', attrs: { level: node.depth } };
}

function paragraph(node: Paragraph, ctx: ConvertContext): TiptapNode | null {
  const image = soloImage(node);
  if (image) {
    ctx.refs.images.push({ src: image.url, node: image });
    return {
      type: 'image',
      attrs: { src: image.url, alt: image.alt ?? '', caption: image.title ?? null },
    };
  }
  const content = inline(node.children, [], ctx);
  return content.length ? { type: 'paragraph', content } : null;
}

function code(node: Code): TiptapNode {
  const language = normalizeLanguage(node.lang);
  return node.value
    ? { type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text: node.value }] }
    : { type: 'codeBlock', attrs: { language } };
}

function listItem(node: ListItem, ctx: ConvertContext): TiptapNode | null {
  if (node.checked !== null && node.checked !== undefined) {
    ctx.bag.report(node, 'lista de tarefas (`- [ ]`) não é suportada.');
    return null;
  }
  const children = blocks(node.children, ctx);
  if (children[0]?.type !== 'paragraph') {
    ctx.bag.report(node, 'item de lista precisa começar com texto (um parágrafo).');
    return null;
  }
  return { type: 'listItem', content: children };
}

function list(node: List, ctx: ConvertContext): TiptapNode | null {
  const items = node.children
    .map((item) => listItem(item, ctx))
    .filter((item): item is TiptapNode => item !== null);
  if (!items.length) return null;
  return node.ordered
    ? { type: 'orderedList', attrs: { start: node.start ?? 1, type: null }, content: items }
    : { type: 'bulletList', content: items };
}

function table(node: Table, ctx: ConvertContext): TiptapNode {
  const rows = node.children.map((row, rowIndex) => ({
    type: 'tableRow',
    content: row.children.map((cell, column) => {
      const content = inline(cell.children, [], ctx);
      return {
        type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
        // `align` vem do alinhamento da coluna no GFM (`:---:`).
        attrs: { colspan: 1, rowspan: 1, colwidth: null, align: node.align?.[column] ?? null },
        content: [content.length ? { type: 'paragraph', content } : { type: 'paragraph' }],
      };
    }),
  }));
  return { type: 'table', content: rows };
}

/** Converte uma sequência de blocos mdast em nós Tiptap. */
export function blocks(nodes: RootContent[], ctx: ConvertContext): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const node of nodes) {
    let converted: TiptapNode | null = null;
    switch (node.type) {
      case 'yaml':
        continue; // frontmatter, lido à parte
      case 'heading':
        converted = heading(node, ctx);
        break;
      case 'paragraph':
        converted = paragraph(node, ctx);
        break;
      case 'list':
        converted = list(node, ctx);
        break;
      case 'code':
        converted = code(node);
        break;
      case 'table':
        converted = table(node, ctx);
        break;
      default: {
        const type = (node as AnyNode).type;
        const message = UNSUPPORTED_BLOCK[type];
        if (message) ctx.bag.report(node, message);
        else if (type === 'mdxJsxFlowElement' || type === 'mdxJsxTextElement') {
          const name = (node as unknown as { name: string | null }).name ?? 'fragmento';
          ctx.bag.report(node, `<${name}> não é um componente aceito.`);
        } else ctx.bag.report(node, `elemento "${type}" não é suportado.`);
      }
    }
    if (converted) out.push(converted);
  }
  return out;
}
