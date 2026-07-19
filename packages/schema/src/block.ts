/**
 * Tipos de bloco do MVP, espelhando o campo `tipo` de `blocks` no modelo de dados
 * (PRD seção 9). O conteúdo Tiptap é mantido como `unknown` de propósito — a
 * validação do JSON de nós acontece na camada do editor, não aqui.
 */

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'code'
  | 'image'
  | 'table'
  | 'callout'
  | 'component-embed';

/** JSON de conteúdo Tiptap (ProseMirror doc/node). Não re-validado neste pacote. */
export type TiptapJson = unknown;

interface BlockBase<T extends BlockType, C> {
  id: string;
  tabId: string;
  type: T;
  content: C;
  ordem: number;
}

export interface HeadingBlockContent {
  level: 1 | 2 | 3 | 4;
  body: TiptapJson;
}

export interface ParagraphBlockContent {
  body: TiptapJson;
}

export interface ListBlockContent {
  ordered: boolean;
  items: TiptapJson[];
}

export interface CodeBlockContent {
  language: string | null;
  code: string;
}

export interface ImageBlockContent {
  src: string;
  alt: string;
  caption: string | null;
}

export interface TableBlockContent {
  body: TiptapJson;
}

export type CalloutVariant = 'info' | 'warning' | 'tip';

export interface CalloutBlockContent {
  variant: CalloutVariant;
  body: TiptapJson;
}

export interface ComponentEmbedBlockContent {
  componentName: string;
  /** `null` até o editor escolher uma variante do preview. */
  variantId: string | null;
}

export type HeadingBlock = BlockBase<'heading', HeadingBlockContent>;
export type ParagraphBlock = BlockBase<'paragraph', ParagraphBlockContent>;
export type ListBlock = BlockBase<'list', ListBlockContent>;
export type CodeBlock = BlockBase<'code', CodeBlockContent>;
export type ImageBlock = BlockBase<'image', ImageBlockContent>;
export type TableBlock = BlockBase<'table', TableBlockContent>;
export type CalloutBlock = BlockBase<'callout', CalloutBlockContent>;
export type ComponentEmbedBlock = BlockBase<'component-embed', ComponentEmbedBlockContent>;

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | CodeBlock
  | ImageBlock
  | TableBlock
  | CalloutBlock
  | ComponentEmbedBlock;
