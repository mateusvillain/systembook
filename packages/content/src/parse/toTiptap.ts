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
import { blockComponent, isBlockComponent, type JsxElement as BlockJsx } from './components.js';

/**
 * mdast → nós Tiptap (SYS-93), no formato **canônico** que o editor do CMS
 * produz: os mesmos nós, attrs com os valores padrão explícitos, marks na ordem
 * do schema e texto adjacente com os mesmos marks fundido. O teste de
 * round-trip do `@systembook/docs-site` confere isso contra o schema real.
 *
 * Tudo que o CMS não representa vira diagnóstico — nada é descartado em
 * silêncio (`docs/static-format.md`).
 */

/** Onde uma referência aparece no arquivo (1-based). */
export interface SourcePoint {
  line: number;
  column: number;
}

/** Referências que o resto do pipeline resolve (arquivos, páginas). */
export interface ContentReferences {
  images: ({ src: string } & SourcePoint)[];
  links: ({ href: string } & SourcePoint)[];
}

interface ConvertContext {
  bag: DiagnosticBag;
  refs: ContentReferences;
  /** Dentro de célula de tabela: só conteúdo inline. */
  inCell?: boolean;
  /** Componente pai direto, para as regras de aninhamento do CMS. */
  parent?: 'callout' | 'dosDonts';
}

function pointOf(node: Positioned): SourcePoint {
  const start = node.position?.start;
  return { line: start?.line ?? 1, column: start?.column ?? 1 };
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

/**
 * Ordem dos marks no schema do conteúdo, que é a ordem em que o ProseMirror
 * os grava no JSON. Não é a ordem das extensões: o Tiptap registra por
 * prioridade, e o Link (prioridade 1000) vem antes. O teste de round-trip do
 * `@systembook/docs-site` confere esta lista contra o schema real.
 */
export const MARK_ORDER = ['link', 'bold', 'italic', 'underline', 'code'] as const;
type MarkType = (typeof MARK_ORDER)[number];
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

/** Acrescenta um mark — o mesmo tipo duas vezes (`**a **b****`) é um só. */
function withMark(marks: Mark[], mark: Mark): Mark[] {
  return marks.some((m) => m.type === mark.type) ? marks : [...marks, mark];
}

function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
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

/** Shape mínimo de um elemento JSX do remark-mdx (`<u>`, `<Callout>`…). */
interface JsxElement {
  name: string | null;
  attributes: unknown[];
  children: unknown[];
}

const ACCEPTED_COMPONENTS = '<Callout>, <ComponentEmbed>, <DosDonts> ou <u>';

function componentMessage(name: string | null): string {
  return name
    ? `<${name}> não é um componente aceito — use ${ACCEPTED_COMPONENTS}.`
    : `fragmento JSX (<>…</>) não é aceito — use ${ACCEPTED_COMPONENTS}.`;
}

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
        out.push(...inline(node.children, withMark(marks, { type: 'bold' }), ctx));
        break;
      case 'emphasis':
        out.push(...inline(node.children, withMark(marks, { type: 'italic' }), ctx));
        break;
      case 'inlineCode':
        // O mark `code` do conteúdo convive com os outros (ver `createContentExtensions`):
        // `[`Button`](./button.mdx)` é link + código.
        if (!node.value) {
          ctx.bag.report(node, 'código inline vazio — remova os acentos graves ou escreva o código.');
          break;
        }
        out.push({ type: 'text', text: node.value, marks: sortMarks(withMark(marks, { type: 'code' })) });
        break;
      case 'link': {
        if (marks.some((m) => m.type === 'link')) {
          ctx.bag.report(node, 'link dentro de link não é suportado.');
          break;
        }
        const content = inline(node.children, [...marks, linkMark(node.url, node.title)], ctx);
        if (!content.length) {
          ctx.bag.report(node, 'link sem texto — escreva o texto entre os colchetes: [texto](url).');
          break;
        }
        ctx.refs.links.push({ href: node.url, ...pointOf(node) });
        out.push(...content);
        break;
      }
      case 'image':
        ctx.bag.report(
          node,
          ctx.inCell
            ? 'imagem não pode ficar em célula de tabela.'
            : 'imagem no meio do texto não é suportada — deixe a imagem sozinha num parágrafo (ela vira um bloco).',
        );
        break;
      case 'mdxJsxTextElement': {
        const jsx = node as unknown as JsxElement;
        if (isBlockComponent(jsx.name)) {
          ctx.bag.report(node, `<${jsx.name}> é um bloco — deixe-o sozinho, fora do texto do parágrafo.`);
          break;
        }
        if (jsx.name !== 'u') {
          ctx.bag.report(node, componentMessage(jsx.name));
          break;
        }
        if (jsx.attributes.length) ctx.bag.report(node, '<u> não aceita props.');
        out.push(...inline(jsx.children as PhrasingContent[], withMark(marks, { type: 'underline' }), ctx));
        break;
      }
      default: {
        const type = (node as AnyNode).type;
        ctx.bag.report(node, UNSUPPORTED_INLINE[type] ?? `elemento "${type}" não é suportado.`);
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
  // Converte antes de recusar o nível: os problemas dentro do heading também
  // precisam aparecer na mesma rodada.
  const content = inline(node.children, [], ctx);
  if (node.depth > 3) {
    ctx.bag.report(node, `heading de nível ${node.depth} não é suportado — use até ###.`);
    return null;
  }
  return content.length
    ? { type: 'heading', attrs: { level: node.depth }, content }
    : { type: 'heading', attrs: { level: node.depth } };
}

/** Parágrafo que é só um componente de bloco escrito numa linha (`<Callout>…</Callout>`). */
function soloComponent(node: Paragraph): BlockJsx | null {
  const meaningful = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''));
  const [only] = meaningful as unknown as BlockJsx[];
  return meaningful.length === 1 && only?.type === 'mdxJsxTextElement' && isBlockComponent(only.name)
    ? only
    : null;
}

function component(el: BlockJsx, ctx: ConvertContext): TiptapNode | null {
  return blockComponent(el, {
    bag: ctx.bag,
    convertChildren: (children, parent) => blocks(children, { ...ctx, parent }),
    addImage: (src, at) => ctx.refs.images.push({ src, ...pointOf(at) }),
  });
}

function paragraph(node: Paragraph, ctx: ConvertContext): TiptapNode | null {
  const single = soloComponent(node);
  if (single) return component(single, ctx);
  const image = soloImage(node);
  if (image) {
    ctx.refs.images.push({ src: image.url, ...pointOf(image) });
    return {
      type: 'image',
      attrs: { src: image.url, alt: image.alt ?? '', caption: image.title ?? null },
    };
  }
  const content = inline(node.children, [], ctx);
  return content.length ? { type: 'paragraph', content } : null;
}

function code(node: Code, ctx: ConvertContext): TiptapNode {
  if (node.meta) {
    ctx.bag.report(node, `metadados do bloco de código ("${node.meta}") não são suportados — deixe só a linguagem.`);
  }
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
      const content = inline(cell.children, [], { ...ctx, inCell: true });
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

/** Tipos inline do mdast — aparecem soltos como filhos de um componente de uma linha. */
const PHRASING = new Set([
  'text', 'emphasis', 'strong', 'inlineCode', 'link', 'image', 'break', 'delete', 'html',
  'mdxJsxTextElement', 'mdxTextExpression', 'footnoteReference', 'linkReference', 'imageReference',
]);

/** Agrupa filhos inline soltos em parágrafos, para converter como blocos. */
function asBlocks(nodes: RootContent[]): RootContent[] {
  const out: RootContent[] = [];
  let run: PhrasingContent[] = [];
  const flush = () => {
    if (run.length) out.push({ type: 'paragraph', children: run, position: run[0]!.position } as Paragraph);
    run = [];
  };
  for (const node of nodes) {
    if (PHRASING.has(node.type)) run.push(node as PhrasingContent);
    else {
      flush();
      out.push(node);
    }
  }
  flush();
  return out;
}

/** Converte uma sequência de blocos mdast em nós Tiptap. */
export function blocks(nodes: RootContent[], ctx: ConvertContext): TiptapNode[] {
  const out: TiptapNode[] = [];
  const { parent, ...childCtx } = ctx;
  for (const node of asBlocks(nodes)) {
    let converted: TiptapNode | null = null;
    switch (node.type) {
      case 'yaml':
        continue; // frontmatter, lido à parte
      case 'heading':
        converted = heading(node, childCtx);
        break;
      case 'paragraph':
        converted = paragraph(node, childCtx);
        break;
      case 'list':
        converted = list(node, childCtx);
        break;
      case 'code':
        converted = code(node, childCtx);
        break;
      case 'table':
        if (parent === 'callout') {
          ctx.bag.report(node, 'tabela dentro de <Callout> não é suportada (como no editor do CMS).');
          break;
        }
        converted = table(node, childCtx);
        break;
      default: {
        const type = (node as AnyNode).type;
        const message = UNSUPPORTED_BLOCK[type];
        if (message) ctx.bag.report(node, message);
        else if (type === 'mdxJsxFlowElement') {
          const jsx = node as unknown as JsxElement;
          if (jsx.name === 'u') {
            // `<u>…</u>` sozinho na linha vira elemento de bloco no MDX: é um
            // parágrafo sublinhado.
            if (jsx.attributes.length) ctx.bag.report(node, '<u> não aceita props.');
            for (const child of jsx.children as RootContent[]) {
              const children = child.type === 'paragraph' ? child.children : null;
              if (!children) {
                ctx.bag.report(child, '<u> só aceita texto.');
                continue;
              }
              const content = inline(children, [{ type: 'underline' }], ctx);
              if (content.length) out.push({ type: 'paragraph', content });
            }
            continue;
          }
          if (isBlockComponent(jsx.name)) {
            converted = component(node as unknown as BlockJsx, childCtx);
            break;
          }
          ctx.bag.report(node, componentMessage(jsx.name));
        } else ctx.bag.report(node, `elemento "${type}" não é suportado.`);
      }
    }
    if (converted) out.push(converted);
  }
  return out;
}
