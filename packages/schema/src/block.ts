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

/**
 * Mapeamento canônico node↔block confirmado na TASK-31 (implementado em
 * apps/server/src/blocks/serialize.ts):
 * - `heading.body` e `paragraph.body` guardam o array `content` inline do nó;
 * - `list.body` e `table.body` guardam o **nó completo** (preserva attrs como
 *   `start` da lista ordenada e colwidths da tabela);
 * - `callout.body` guarda o array `content` aninhado (attrs ficam em `variant`);
 * - `code` e `image`/`component-embed` são totalmente estruturados (sem body).
 */

export interface HeadingBlockContent {
  level: 1 | 2 | 3 | 4;
  body: TiptapJson;
}

export interface ParagraphBlockContent {
  body: TiptapJson;
}

export interface ListBlockContent {
  ordered: boolean;
  /** Nó Tiptap completo (`bulletList`/`orderedList`) — TASK-31 trocou o
   * `items: TiptapJson[]` original para não perder attrs do nó de lista. */
  body: TiptapJson;
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

/**
 * Forma real confirmada na TASK-27: `body` é o nó Tiptap `table`, com
 * `tableRow` > `tableHeader`/`tableCell` (attrs colspan/rowspan/colwidth) >
 * conteúdo rich-text por célula. Cabe em `TiptapJson` sem ajuste no schema.
 */
export interface TableBlockContent {
  body: TiptapJson;
}

export type CalloutVariant = 'info' | 'warning' | 'tip';

/**
 * Forma confirmada na TASK-28: o nó Tiptap é
 * `{ type: 'callout', attrs: { variant }, content: [...] }` — `variant` mapeia
 * de `attrs.variant` e `body` do `content` aninhado (block+).
 */
export interface CalloutBlockContent {
  variant: CalloutVariant;
  body: TiptapJson;
}

/**
 * Forma confirmada na TASK-29: o nó Tiptap é atômico —
 * `{ type: 'componentEmbed', attrs: { componentName, variantId } }`, sem
 * `content`. O preview real (TASK-47/48) usa estes mesmos attrs.
 */
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

/**
 * Forma do `snapshot_json` de `revisions` (TASK-33): snapshot da **página
 * inteira** no momento do publish — todas as tabs com todos os seus blocks —
 * porque "Publicar" é uma ação de página no fluxo do PRD, não de tab.
 */
export interface PageSnapshot {
  tabs: {
    tabId: string;
    titulo: string;
    blocks: Block[];
  }[];
}
