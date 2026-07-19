import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';

/**
 * Slot de preview de componente (TASK-29) — nesta fase é só um placeholder
 * atômico que reserva `componentName`/`variantId` no JSON. O preview real via
 * iframe chega na TASK-47 e a UI de seleção na TASK-48, ambos por cima deste
 * mesmo nó, sem mudar a forma persistida.
 */

function ComponentEmbedView({ node }: NodeViewProps) {
  const componentName = node.attrs.componentName as string;

  return (
    <NodeViewWrapper className="sb-component-embed" data-component-name={componentName}>
      <span aria-hidden style={{ fontSize: '1.2rem' }}>
        🧩
      </span>
      {componentName ? (
        <span>
          Preview de <strong>{componentName}</strong> (disponível na Fase 5)
        </span>
      ) : (
        <span>Placeholder do preview de componente — selecione um componente (Fase 5)</span>
      )}
    </NodeViewWrapper>
  );
}

export const ComponentEmbed = Node.create({
  name: 'componentEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      componentName: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-component-name') ?? '',
        renderHTML: (attributes) => ({ 'data-component-name': attributes.componentName }),
      },
      variantId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-variant-id'),
        renderHTML: (attributes) =>
          attributes.variantId === null ? {} : { 'data-variant-id': attributes.variantId },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-component-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-component-embed': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ComponentEmbedView);
  },
});
