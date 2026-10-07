import type { ComponentType } from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { TriangleAlert } from 'lucide-react';
import { tokenGroups, tokensInGroup } from '@systembook/content/tokens';
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
 *
 * O seletor de grupo (SYS-138) é injetado pelo editor via a opção
 * `EditControls`, como no `component-embed`.
 */
/** O que o seletor de grupo do editor precisa saber (SYS-138). */
export interface TokenTableEditControlsProps {
  group: string;
  /** Grupos disponíveis (`tokenGroups`), vazio enquanto carrega ou sem tokens. */
  groups: readonly string[];
  /** `false` sem nenhum token publicado ou com erro de leitura. */
  hasTokens: boolean;
  loading: boolean;
  onSelect: (group: string) => void;
}

export interface TokenTableOptions {
  /** Seletor de grupo; `null` na renderização read-only. */
  EditControls: ComponentType<TokenTableEditControlsProps> | null;
}

function TokenTableView({ node, updateAttributes, editor, extension }: NodeViewProps) {
  const group = node.attrs.group as string;
  const query = useTokens();
  const set = query.data ?? null;
  const tokens = set ? tokensInGroup(set.tokens, group) : [];
  const state = query.isLoading ? 'loading' : query.isError ? 'error' : tokens.length ? 'ready' : 'empty';

  // O seletor só existe editando, e quando o editor o injetou (como o embed).
  const { EditControls } = extension.options as TokenTableOptions;
  const control =
    editor.isEditable && EditControls ? (
      <div className="sb-token-block-bar" contentEditable={false}>
        <EditControls
          group={group}
          groups={set ? tokenGroups(set.tokens) : []}
          hasTokens={!!set}
          loading={query.isLoading}
          onSelect={(next) => updateAttributes({ group: next })}
        />
      </div>
    ) : null;

  return (
    <NodeViewWrapper className="sb-token-block" data-group={group} data-state={state}>
      {control}
      {state === 'loading' ? (
        <div className="sb-token-block-notice" role="status">
          Loading tokens…
        </div>
      ) : state === 'ready' ? (
        <TokenGroup tokens={tokens} modes={set!.modes} label={group || 'All tokens'} />
      ) : (
        <div className="sb-token-block-notice" role="note">
          <TriangleAlert aria-hidden size={19} />
          <span>
            {state === 'error' ? (
              'Could not load the design tokens.'
            ) : !set ? (
              'No design tokens published yet.'
            ) : (
              <>
                No tokens in group <code>{group}</code>.
              </>
            )}
          </span>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const TokenTableNode = Node.create<TokenTableOptions>({
  name: 'tokenTable',
  group: 'block',
  atom: true,

  addOptions() {
    return { EditControls: null };
  },

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
