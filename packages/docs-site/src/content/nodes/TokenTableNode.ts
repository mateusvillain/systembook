import { mergeAttributes, Node } from '@tiptap/core';

/**
 * Bloco de tabela de design tokens (SYS-137): nó atômico que guarda só o
 * grupo (`color.brand`; `""` = todos). A forma persistida está em
 * `packages/schema/src/block.ts` (`TokenTableBlockContent`). Os valores vêm do
 * `DocsDataSource.getTokens()` na hora de mostrar — a renderização é da
 * SYS-139; aqui o nó existe no schema, para o conteúdo com o bloco carregar.
 */
export const TokenTableNode = Node.create({
  name: 'tokenTable',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      group: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-group') ?? '',
        renderHTML: (attributes) => ({ 'data-group': attributes.group }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-token-table]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-token-table': '' }, HTMLAttributes)];
  },
});
