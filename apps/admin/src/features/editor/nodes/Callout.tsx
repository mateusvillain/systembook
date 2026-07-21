import { mergeAttributes, Node } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import type { CalloutVariant } from '@systembook/schema';

/**
 * Primeiro nó custom do editor (TASK-28) — o padrão NodeView React usado aqui
 * (extensão + view no mesmo arquivo, attrs espelhados em data-*) é o modelo
 * para component-embed (TASK-29) e os nós das próximas fases.
 */

export const CALLOUT_VARIANTS = ['info', 'warning', 'tip'] as const satisfies readonly CalloutVariant[];

export const CALLOUT_META: Record<CalloutVariant, { icon: string; label: string; border: string; bg: string }> = {
  info: { icon: 'ℹ️', label: 'Info', border: '#7aa7ff', bg: '#eef4ff' },
  warning: { icon: '⚠️', label: 'Aviso', border: '#e8b04a', bg: '#fdf6e7' },
  tip: { icon: '💡', label: 'Dica', border: '#5fbf7a', bg: '#ecf8f0' },
};

function isVariant(value: unknown): value is CalloutVariant {
  return CALLOUT_VARIANTS.includes(value as CalloutVariant);
}

function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const variant = node.attrs.variant as CalloutVariant;
  const meta = CALLOUT_META[variant];

  return (
    <NodeViewWrapper className="sb-callout" data-variant={variant}>
      <div className="sb-callout-header" contentEditable={false}>
        <span aria-hidden>{meta.icon}</span>
        {editor.isEditable && (
          <span role="group" aria-label="Variante do callout" className="sb-callout-switcher">
            {CALLOUT_VARIANTS.map((v) => (
              <button
                key={v}
                type="button"
                title={`Mudar para ${CALLOUT_META[v].label.toLowerCase()}`}
                aria-pressed={v === variant}
                className="sb-callout-switch"
                data-active={v === variant || undefined}
                onClick={() => updateAttributes({ variant: v })}
              >
                {CALLOUT_META[v].icon} {CALLOUT_META[v].label}
              </button>
            ))}
          </span>
        )}
      </div>
      <NodeViewContent className="sb-callout-content" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info' satisfies CalloutVariant,
        parseHTML: (element) => {
          const value = element.getAttribute('data-variant');
          return isVariant(value) ? value : 'info';
        },
        renderHTML: (attributes) => ({ 'data-variant': attributes.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-callout': '' }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
