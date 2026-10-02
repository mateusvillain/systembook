import type { Block, BlockType } from '@systembook/schema';

/**
 * Mapeamento canônico entre nós Tiptap top-level e blocos do SystemBook
 * (TASK-31; centralizado aqui na SYS-93). É a única implementação: o server
 * (`blocks/serialize.ts`, persistência), a doc pública (`@systembook/docs-site`,
 * renderização) e o parser de arquivos deste pacote usam estas funções. A
 * forma de cada tipo está documentada em `packages/schema/src/block.ts`.
 *
 * Funções puras, sem dependência de Tiptap — o shape mínimo de nó é declarado
 * aqui.
 */

// type aliases (não interfaces) de propósito: o input zod do router do server
// infere um shape com index signature, e interfaces não são atribuíveis a ele.
export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: unknown[];
  text?: string;
};

export type TiptapDoc = {
  type: 'doc';
  content?: TiptapNode[];
};

/** Bloco sem identidade nem posição: o que o mapeamento produz e consome. */
export type BlockData = { [T in BlockType]: { type: T; content: Extract<Block, { type: T }>['content'] } }[BlockType];

/** Nó top-level desconhecido — o server o transforma em BAD_REQUEST. */
export class UnknownNodeTypeError extends Error {
  constructor(nodeType: string) {
    super(`Tipo de nó não suportado no doc: "${nodeType}"`);
    this.name = 'UnknownNodeTypeError';
  }
}

function codeText(node: TiptapNode): string {
  return (node.content ?? []).map((child) => child.text ?? '').join('');
}

export function nodeToBlock(node: TiptapNode): BlockData {
  switch (node.type) {
    case 'heading':
      return {
        type: 'heading',
        content: { level: (node.attrs?.level as 1 | 2 | 3 | 4) ?? 1, body: node.content },
      };
    case 'paragraph':
      return { type: 'paragraph', content: { body: node.content } };
    case 'bulletList':
      return { type: 'list', content: { ordered: false, body: node } };
    case 'orderedList':
      return { type: 'list', content: { ordered: true, body: node } };
    case 'codeBlock':
      return {
        type: 'code',
        content: { language: (node.attrs?.language as string | null) ?? null, code: codeText(node) },
      };
    case 'image':
      return {
        type: 'image',
        content: {
          src: (node.attrs?.src as string) ?? '',
          alt: (node.attrs?.alt as string) ?? '',
          caption: (node.attrs?.caption as string | null) ?? null,
        },
      };
    case 'table':
      return { type: 'table', content: { body: node } };
    case 'callout':
      return {
        type: 'callout',
        content: { variant: (node.attrs?.variant as 'info') ?? 'info', body: node.content },
      };
    case 'componentEmbed':
      return {
        type: 'component-embed',
        content: {
          componentName: (node.attrs?.componentName as string) ?? '',
          variantId: (node.attrs?.variantId as string | null) ?? null,
        },
      };
    case 'dosDonts':
      return {
        type: 'dos-donts',
        content: {
          variant: (node.attrs?.variant as 'do') ?? 'do',
          titulo: (node.attrs?.titulo as string) ?? '',
          cover: (node.attrs?.cover as Extract<Block, { type: 'dos-donts' }>['content']['cover']) ?? undefined,
          descricao: node.content,
        },
      };
    default:
      throw new UnknownNodeTypeError(node.type);
  }
}

export function blockToNode(block: BlockData): TiptapNode {
  switch (block.type) {
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: block.content.level },
        content: block.content.body as TiptapNode[],
      };
    case 'paragraph':
      return { type: 'paragraph', content: block.content.body as TiptapNode[] };
    case 'list':
      return block.content.body as TiptapNode;
    case 'code':
      return {
        type: 'codeBlock',
        attrs: { language: block.content.language },
        content: block.content.code === '' ? undefined : [{ type: 'text', text: block.content.code }],
      };
    case 'image':
      return {
        type: 'image',
        attrs: { src: block.content.src, alt: block.content.alt, caption: block.content.caption },
      };
    case 'table':
      return block.content.body as TiptapNode;
    case 'callout':
      return {
        type: 'callout',
        attrs: { variant: block.content.variant },
        content: block.content.body as TiptapNode[],
      };
    case 'component-embed':
      return {
        type: 'componentEmbed',
        attrs: { componentName: block.content.componentName, variantId: block.content.variantId },
      };
    case 'dos-donts':
      return {
        type: 'dosDonts',
        attrs: { variant: block.content.variant, titulo: block.content.titulo, cover: block.content.cover ?? null },
        content: block.content.descricao as TiptapNode[],
      };
  }
}

/** Doc → blocos na ordem do documento (`ordem` = posição). */
export function tiptapDocToBlocks(doc: TiptapDoc): (BlockData & { ordem: number })[] {
  return (doc.content ?? []).map((node, ordem) => ({ ...nodeToBlock(node), ordem }));
}

/** Blocos (em qualquer ordem) → doc, ordenando por `ordem`. */
export function blocksToTiptapDoc(blocks: readonly (BlockData & { ordem: number })[]): TiptapDoc {
  return {
    type: 'doc',
    content: [...blocks].sort((a, b) => a.ordem - b.ordem).map(blockToNode),
  };
}
