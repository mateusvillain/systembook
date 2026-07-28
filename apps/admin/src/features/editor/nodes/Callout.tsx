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

function isVariant(value: unknown): value is CalloutVariant {
  return CALLOUT_VARIANTS.includes(value as CalloutVariant);
}

function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
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
      {editor.isEditable && (
        <span
          role="group"
          aria-label="Variante do callout"
          className="sb-callout-switcher"
          contentEditable={false}
        >
          {CALLOUT_VARIANTS.map((v) => {
            const SwitchIcon = CALLOUT_META[v].icon;
            return (
              <button
                key={v}
                type="button"
                title={`Change to ${CALLOUT_META[v].label.toLowerCase()}`}
                aria-pressed={v === variant}
                className="sb-callout-switch"
                data-active={v === variant || undefined}
                onClick={() => updateAttributes({ variant: v })}
              >
                <SwitchIcon aria-hidden size={12} />
                {CALLOUT_META[v].label}
              </button>
            );
          })}
        </span>
      )}
    </NodeViewWrapper>
  );
}

/**
 * Conteúdo do callout (TASK-101): enumera explicitamente os blocos permitidos
 * em vez do `'block+'` original — exclui `table` (uma tabela dentro de um
 * alerta não faz sentido no design system e o `TableControls`/toolbar não têm
 * como agir dentro dele), mantendo tudo o mais que já funcionava, incluindo
 * callout/dos-donts/embed aninhados.
 */
const CALLOUT_CONTENT =
  '(paragraph | heading | bulletList | orderedList | codeBlock | callout | dosDonts | componentEmbed)+';

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: CALLOUT_CONTENT,
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
