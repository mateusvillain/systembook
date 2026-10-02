import type { Block } from '@systembook/schema';
import type { JSONContent } from '@tiptap/core';
import { blocksToTiptapDoc as canonical } from '@systembook/content/blocks';

/**
 * Blocos de um `PageSnapshot` → doc Tiptap para o renderer. O mapeamento é o
 * canônico de `@systembook/content/blocks` (SYS-93), o mesmo do parser de
 * arquivos; o server mantém uma cópia verificada por teste de paridade.
 */
export function blocksToTiptapDoc(blocks: readonly Block[]): JSONContent {
  return canonical(blocks) as JSONContent;
}
