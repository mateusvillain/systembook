import { mergeAttributes, Node } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import type { DosDontsCover, DosDontsVariant } from '@systembook/schema';
import { DosDontsCoverField } from './DosDontsCover.js';

/**
 * Bloco de convenção de uso (Fase 8, TASK-72/73) — mesmo padrão NodeView React
 * estabelecido pelo `Callout` (TASK-28): extensão + view no mesmo arquivo,
 * attrs espelhados em `data-*`, switcher in-place preservando o conteúdo.
 *
 * `cover` (TASK-73) é opcional — imagem OU component-embed — e sua UI vive em
 * `DosDontsCover.tsx`.
 */

export const DOS_DONTS_VARIANTS = ['do', 'dont'] as const satisfies readonly DosDontsVariant[];

export const DOS_DONTS_META: Record<DosDontsVariant, { icon: string; label: string; border: string; bg: string }> = {
  do: { icon: '✅', label: 'Do', border: '#5fbf7a', bg: '#ecf8f0' },
  dont: { icon: '🚫', label: "Don't", border: '#e05a5a', bg: '#fdecec' },
};

function isVariant(value: unknown): value is DosDontsVariant {
  return DOS_DONTS_VARIANTS.includes(value as DosDontsVariant);
}

function parseCover(raw: string | null): DosDontsCover | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DosDontsCover;
  } catch {
    return null;
  }
}

function DosDontsView({ node, updateAttributes, editor }: NodeViewProps) {
  const variant = node.attrs.variant as DosDontsVariant;
  const titulo = node.attrs.titulo as string;
  const cover = node.attrs.cover as DosDontsCover | null;
  const meta = DOS_DONTS_META[variant];

  return (
    <NodeViewWrapper className="sb-dos-donts" data-variant={variant}>
      <DosDontsCoverField
        cover={cover}
        editable={editor.isEditable}
        onChange={(next) => updateAttributes({ cover: next })}
      />
      <div className="sb-dos-donts-header" contentEditable={false}>
        <span aria-hidden>{meta.icon}</span>
        {editor.isEditable && (
          <span role="group" aria-label="Variante do bloco Do/Don't" className="sb-dos-donts-switcher">
            {DOS_DONTS_VARIANTS.map((v) => (
              <button
                key={v}
                type="button"
                title={`Mudar para ${DOS_DONTS_META[v].label}`}
                aria-pressed={v === variant}
                className="sb-dos-donts-switch"
                data-active={v === variant || undefined}
                onClick={() => updateAttributes({ variant: v })}
              >
                {DOS_DONTS_META[v].icon} {DOS_DONTS_META[v].label}
              </button>
            ))}
          </span>
        )}
        {editor.isEditable ? (
          <input
            type="text"
            className="sb-dos-donts-title-input"
            placeholder="Título"
            value={titulo}
            aria-label="Título do bloco Do/Don't"
            onChange={(e) => updateAttributes({ titulo: e.target.value })}
          />
        ) : (
          titulo && <strong className="sb-dos-donts-title">{titulo}</strong>
        )}
      </div>
      <NodeViewContent className="sb-dos-donts-content" />
    </NodeViewWrapper>
  );
}

export const DosDonts = Node.create({
  name: 'dosDonts',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'do' satisfies DosDontsVariant,
        parseHTML: (element) => {
          const value = element.getAttribute('data-variant');
          return isVariant(value) ? value : 'do';
        },
        renderHTML: (attributes) => ({ 'data-variant': attributes.variant }),
      },
      titulo: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-titulo') ?? '',
        renderHTML: (attributes) => ({ 'data-titulo': attributes.titulo }),
      },
      cover: {
        default: null,
        parseHTML: (element) => parseCover(element.getAttribute('data-cover')),
        renderHTML: (attributes) => ({
          'data-cover': attributes.cover ? JSON.stringify(attributes.cover) : '',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-dos-donts]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-dos-donts': '' }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DosDontsView);
  },
});
