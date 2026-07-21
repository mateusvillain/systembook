import type { Block } from '@systembook/schema';
import type { JSONContent } from '@tiptap/core';

/**
 * Espelha `blockToNode`/`blocksToTiptapDoc` de
 * `apps/server/src/blocks/serialize.ts` — não pode ser importado direto do
 * server (fronteira de pacote/runtime, TASK-31), então a conversão block→nó
 * é duplicada aqui só para o preview read-only de revisões (TASK-35). Mesma
 * forma documentada em `packages/schema/src/block.ts`; qualquer mudança no
 * mapeamento canônico precisa espelhar nos dois lugares.
 */
function blockToNode(block: Block): JSONContent {
  switch (block.type) {
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: block.content.level },
        content: block.content.body as JSONContent[],
      };
    case 'paragraph':
      return { type: 'paragraph', content: block.content.body as JSONContent[] };
    case 'list':
      return block.content.body as JSONContent;
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
      return block.content.body as JSONContent;
    case 'callout':
      return {
        type: 'callout',
        attrs: { variant: block.content.variant },
        content: block.content.body as JSONContent[],
      };
    case 'component-embed':
      return {
        type: 'componentEmbed',
        attrs: { componentName: block.content.componentName, variantId: block.content.variantId },
      };
    case 'dos-donts':
      return {
        type: 'dosDonts',
        attrs: {
          variant: block.content.variant,
          titulo: block.content.titulo,
          cover: block.content.cover ?? null,
        },
        content: block.content.descricao as JSONContent[],
      };
  }
}

export function blocksToTiptapDoc(blocks: readonly Block[]): JSONContent {
  return {
    type: 'doc',
    content: [...blocks].sort((a, b) => a.ordem - b.ordem).map(blockToNode),
  };
}
