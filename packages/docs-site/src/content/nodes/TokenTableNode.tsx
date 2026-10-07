import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { TriangleAlert } from 'lucide-react';
import { tokensInGroup } from '@systembook/content/tokens';
import { useTokens } from '../docsQueries.js';
import { TokenGroup } from '../tokens/TokenGroup.js';

/**
 * Bloco de tabela de design tokens: nó atômico que guarda só o grupo
 * (`color.brand`; `""` = todos — SYS-137). A forma persistida está em
 * `packages/schema/src/block.ts` (`TokenTableBlockContent`).
 *
 * O NodeView (SYS-139) lê os tokens do `DocsDataSource.getTokens()` na hora de
 * mostrar — a página acompanha os tokens publicados sem ser editada — e usa o
 * renderer de cada tipo. Grupo sem nenhum token (inexistente, renomeado, ou
 * nenhum token publicado) e erro de leitura viram um aviso no lugar, sem quebrar a página.
 */
function TokenTableView({ node }: NodeViewProps) {
  const group = node.attrs.group as string;
  const query = useTokens();
  const set = query.data ?? null;
  const tokens = set ? tokensInGroup(set.tokens, group) : [];

  if (query.isLoading) {
    return (
      <NodeViewWrapper className="sb-token-block sb-token-block--notice" data-group={group} data-state="loading" role="status">
        Loading tokens…
      </NodeViewWrapper>
    );
  }

  if (!set || !tokens.length) {
    return (
      <NodeViewWrapper className="sb-token-block sb-token-block--notice" data-group={group} data-state={query.isError ? 'error' : 'empty'} role="note">
        <TriangleAlert aria-hidden size={19} />
        <span>
          {query.isError ? (
            'Could not load the design tokens.'
          ) : !set ? (
            'No design tokens published yet.'
          ) : (
            <>
              No tokens in group <code>{group}</code>.
            </>
          )}
        </span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="sb-token-block" data-group={group} data-state="ready">
      <TokenGroup tokens={tokens} modes={set.modes} label={group || 'All tokens'} />
    </NodeViewWrapper>
  );
}

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

  addNodeView() {
    return ReactNodeViewRenderer(TokenTableView);
  },
});
