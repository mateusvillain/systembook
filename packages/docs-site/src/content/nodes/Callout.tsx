import type { ComponentType } from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { AlertTriangle, Info, Lightbulb, type LucideIcon } from 'lucide-react';
import type { CalloutVariant } from '@systembook/schema';

/**
 * Primeiro nó custom do editor (TASK-28) — o padrão NodeView React usado aqui
 * (extensão + view no mesmo arquivo, attrs espelhados em data-*) é o modelo
 * para component-embed (TASK-29) e os nós das próximas fases.
 */

export const CALLOUT_VARIANTS = ['info', 'warning', 'tip'] as const satisfies readonly CalloutVariant[];

export const CALLOUT_META: Record<CalloutVariant, { icon: LucideIcon; label: string; border: string; bg: string }> = {
  info: { icon: Info, label: 'Info', border: '#7aa7ff', bg: '#eef4ff' },
  warning: { icon: AlertTriangle, label: 'Warning', border: '#e8b04a', bg: '#fdf6e7' },
  tip: { icon: Lightbulb, label: 'Tip', border: '#5fbf7a', bg: '#ecf8f0' },
};

/** Troca de variante injetada pelo editor (SYS-89); `null` no read-only. */
export interface VariantSwitcherProps<V extends string> {
  variant: V;
  onChange: (variant: V) => void;
}

export interface CalloutOptions {
  VariantSwitcher: ComponentType<VariantSwitcherProps<CalloutVariant>> | null;
}

function isVariant(value: unknown): value is CalloutVariant {
  return CALLOUT_VARIANTS.includes(value as CalloutVariant);
}

function CalloutView({ node, updateAttributes, editor, extension }: NodeViewProps) {
  const { VariantSwitcher } = extension.options as CalloutOptions;
  const variant = node.attrs.variant as CalloutVariant;
  const meta = CALLOUT_META[variant];
  const Icon = meta.icon;

  return (
    <NodeViewWrapper className="sb-callout" data-variant={variant}>
      {/* Ícone puro na coluna esquerda — nada mais aqui, pra alinhar de forma
          previsível com a 1ª linha do texto ao lado (o switcher de variante,
          quando presente, vira um overlay à parte, não disputa espaço/altura
          com o ícone). */}
      <span className="sb-callout-icon" contentEditable={false}>
        <Icon aria-hidden size={18} />
      </span>
      <NodeViewContent className="sb-callout-content" />
      {editor.isEditable && VariantSwitcher && (
        <VariantSwitcher variant={variant} onChange={(v) => updateAttributes({ variant: v })} />
      )}
    </NodeViewWrapper>
  );
}

/**
 * Conteúdo do callout (TASK-101): enumera explicitamente os blocos permitidos
 * em vez do `'block+'` original — exclui `table` (uma tabela dentro de um
 * alerta não faz sentido no design system e o `TableControls`/toolbar não têm
 * como agir dentro dele), mantendo tudo o mais que já funcionava, incluindo
 * callout/dos-donts/embed aninhados. `image` entrou com o nó de imagem (SYS-93).
 */
const CALLOUT_CONTENT =
  '(paragraph | heading | bulletList | orderedList | codeBlock | callout | dosDonts | componentEmbed | image)+';

export const Callout = Node.create<CalloutOptions>({
  name: 'callout',
  group: 'block',
  content: CALLOUT_CONTENT,
  defining: true,

  addOptions() {
    return { VariantSwitcher: null };
  },

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
