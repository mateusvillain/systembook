import type { BlockType } from '@systembook/schema';
import type { BlockContentFor, NewBlock } from '../db/blocks.js';

/**
 * Ponte doc Tiptap ↔ linhas de `blocks` (TASK-31): um nó top-level por linha.
 * Funções puras — a persistência fica em db/blocks.ts e o transporte no
 * router. O mapeamento canônico por tipo está documentado em
 * packages/schema/src/block.ts; round-trip sem perda é coberto por teste
 * para os 8 tipos do MVP.
 *
 * O server não depende de @tiptap/* — o shape mínimo de nó é declarado aqui.
 */

// type aliases (não interfaces) de propósito: o input zod do router infere um
// shape com index signature, e interfaces não são atribuíveis a ele.
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

export type BlockInsert = NewBlock;

/** Nó top-level desconhecido — vira BAD_REQUEST na borda do router. */
export class UnknownNodeTypeError extends Error {
  constructor(nodeType: string) {
    super(`Tipo de nó não suportado no doc: "${nodeType}"`);
    this.name = 'UnknownNodeTypeError';
  }
}

function codeText(node: TiptapNode): string {
  return (node.content ?? []).map((child) => child.text ?? '').join('');
}

function nodeToBlock(node: TiptapNode): { tipo: BlockType; conteudo: unknown } {
  switch (node.type) {
    case 'heading':
      return { tipo: 'heading', conteudo: { level: node.attrs?.level ?? 1, body: node.content } };
    case 'paragraph':
      return { tipo: 'paragraph', conteudo: { body: node.content } };
    case 'bulletList':
      return { tipo: 'list', conteudo: { ordered: false, body: node } };
    case 'orderedList':
      return { tipo: 'list', conteudo: { ordered: true, body: node } };
    case 'codeBlock':
      return {
        tipo: 'code',
        conteudo: { language: (node.attrs?.language as string | null) ?? null, code: codeText(node) },
      };
    case 'image':
      return {
        tipo: 'image',
        conteudo: {
          src: node.attrs?.src ?? '',
          alt: node.attrs?.alt ?? '',
          caption: node.attrs?.caption ?? null,
        },
      };
    case 'table':
      return { tipo: 'table', conteudo: { body: node } };
    case 'callout':
      return {
        tipo: 'callout',
        conteudo: { variant: node.attrs?.variant ?? 'info', body: node.content },
      };
    case 'componentEmbed':
      return {
        tipo: 'component-embed',
        conteudo: {
          componentName: node.attrs?.componentName ?? '',
          variantId: node.attrs?.variantId ?? null,
        },
      };
    default:
      throw new UnknownNodeTypeError(node.type);
  }
}

function blockToNode(tipo: BlockType, conteudo: unknown): TiptapNode {
  switch (tipo) {
    case 'heading': {
      const c = conteudo as BlockContentFor<'heading'>;
      return { type: 'heading', attrs: { level: c.level }, content: c.body as TiptapNode[] };
    }
    case 'paragraph': {
      const c = conteudo as BlockContentFor<'paragraph'>;
      return { type: 'paragraph', content: c.body as TiptapNode[] };
    }
    case 'list':
      return (conteudo as BlockContentFor<'list'>).body as TiptapNode;
    case 'code': {
      const c = conteudo as BlockContentFor<'code'>;
      return {
        type: 'codeBlock',
        attrs: { language: c.language },
        content: c.code === '' ? undefined : [{ type: 'text', text: c.code }],
      };
    }
    case 'image': {
      const c = conteudo as BlockContentFor<'image'>;
      return { type: 'image', attrs: { src: c.src, alt: c.alt, caption: c.caption } };
    }
    case 'table':
      return (conteudo as BlockContentFor<'table'>).body as TiptapNode;
    case 'callout': {
      const c = conteudo as BlockContentFor<'callout'>;
      return { type: 'callout', attrs: { variant: c.variant }, content: c.body as TiptapNode[] };
    }
    case 'component-embed': {
      const c = conteudo as BlockContentFor<'component-embed'>;
      return {
        type: 'componentEmbed',
        attrs: { componentName: c.componentName, variantId: c.variantId },
      };
    }
  }
}

export function tiptapDocToBlocks(doc: TiptapDoc, tabId: string): BlockInsert[] {
  return (doc.content ?? []).map((node, ordem) => {
    const { tipo, conteudo } = nodeToBlock(node);
    return { tabId, tipo, conteudo, ordem } as BlockInsert;
  });
}

export function blocksToTiptapDoc(
  blocks: readonly { tipo: BlockType; conteudo: unknown; ordem: number }[],
): TiptapDoc {
  const content = [...blocks]
    .sort((a, b) => a.ordem - b.ordem)
    .map((block) => blockToNode(block.tipo, block.conteudo));
  return { type: 'doc', content };
}
