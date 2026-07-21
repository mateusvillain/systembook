import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import type { CalloutVariant, DosDontsVariant } from '@systembook/schema';
import { CALLOUT_META, CALLOUT_VARIANTS } from './nodes/Callout.js';
import { DOS_DONTS_META, DOS_DONTS_VARIANTS } from './nodes/DosDonts.js';
import {
  ComponentEmbedPicker,
  type ComponentEmbedSelection,
} from './ComponentEmbedPicker.js';

const buttonStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.25rem 0.5rem',
  border: '1px solid #ccc',
  borderRadius: 4,
  background: active ? '#333' : '#fff',
  color: active ? '#fff' : '#333',
  cursor: 'pointer',
  fontSize: '0.85rem',
});

function ToolbarButton({
  label,
  title,
  active = false,
  onClick,
}: {
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      style={buttonStyle(active)}
      // onMouseDown+preventDefault mantém a seleção/foco no editor ao clicar
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * Toolbar mínima do MVP (TASK-26/27). Os estados ativos vêm de useEditorState
 * — no Tiptap v3 o useEditor não re-renderiza a cada transação por padrão.
 */
export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        h1: e.isActive('heading', { level: 1 }),
        h2: e.isActive('heading', { level: 2 }),
        h3: e.isActive('heading', { level: 3 }),
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        codeBlock: e.isActive('codeBlock'),
        inTable: e.isActive('table'),
      },
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!editor || !state) return null;

  const chain = () => editor.chain().focus();
  const insertEmbed = (selection: ComponentEmbedSelection) => {
    chain()
      .insertContent({
        type: 'componentEmbed',
        attrs: { componentName: selection.componentName, variantId: selection.variantId },
      })
      .run();
  };
  // Insere `nodeType` com um parágrafo dentro e posiciona o cursor nele — o
  // insertContent sozinho deixa o cursor fora do node quando o parágrafo
  // atual não é vazio. Reusado por insertCallout e insertDosDonts (mesma
  // lógica fiddly de posicionamento do caret, parametrizada por node/attrs).
  const insertBlockWithCaret = (
    nodeType: string,
    attrs: Record<string, unknown>,
    contentSelector: string,
  ) => {
    const from = editor.state.selection.from;
    chain()
      .insertContent({ type: nodeType, attrs, content: [{ type: 'paragraph' }] })
      .run();
    let nodePos: number | null = null;
    editor.state.doc.nodesBetween(
      Math.max(0, from - 1),
      editor.state.doc.content.size,
      (node, pos) => {
        if (nodePos === null && node.type.name === nodeType) nodePos = pos;
      },
    );
    if (nodePos !== null) {
      // +2: entra no node (+1) e no parágrafo inicial (+1)
      const pos = nodePos + 2;
      chain().setTextSelection(pos).run();
      // O NodeView React monta assíncrono e o selectionToDOM do ProseMirror
      // não reposiciona o caret do DOM dentro dele depois — sem isto a
      // digitação seguiria o caret antigo, fora do node. Posiciona o Range
      // manualmente assim que o contentDOM existir.
      const placeCaret = (attempt: number) => {
        if (editor.isDestroyed) return;
        const { node, offset } = editor.view.domAtPos(pos);
        const element = node instanceof Element ? node : node.parentElement;
        if (!element?.closest(contentSelector)) {
          if (attempt < 10) requestAnimationFrame(() => placeCaret(attempt + 1));
          return;
        }
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        editor.view.focus();
      };
      requestAnimationFrame(() => placeCaret(0));
    }
  };
  const insertCallout = (variant: CalloutVariant) =>
    insertBlockWithCaret('callout', { variant }, '.sb-callout-content');
  const insertDosDonts = (variant: DosDontsVariant) =>
    insertBlockWithCaret('dosDonts', { variant, titulo: '', cover: null }, '.sb-dos-donts-content');

  return (
    <div
      role="toolbar"
      aria-label="Formatação"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}
    >
      <ToolbarButton
        label="H1"
        title="Título 1"
        active={state.h1}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        label="H2"
        title="Título 2"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="H3"
        title="Título 3"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        label="B"
        title="Negrito (Cmd/Ctrl+B)"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolbarButton
        label="I"
        title="Itálico (Cmd/Ctrl+I)"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolbarButton
        label="• Lista"
        title="Lista com marcadores"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolbarButton
        label="1. Lista"
        title="Lista numerada"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="</>"
        title="Bloco de código"
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      />
      <ToolbarButton
        label="⊞ Tabela"
        title="Inserir tabela 3×3"
        onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      />
      {/* Picker de variante do callout: o primeiro (info) é o padrão */}
      <span role="group" aria-label="Inserir callout" style={{ display: 'flex', gap: '0.35rem' }}>
        {CALLOUT_VARIANTS.map((variant) => (
          <ToolbarButton
            key={variant}
            label={`${CALLOUT_META[variant].icon} ${CALLOUT_META[variant].label}`}
            title={`Inserir callout ${CALLOUT_META[variant].label.toLowerCase()}`}
            onClick={() => insertCallout(variant)}
          />
        ))}
      </span>
      {/* Picker de variante do dos-donts (TASK-72): "do" é o padrão */}
      <span role="group" aria-label="Inserir Do/Don't" style={{ display: 'flex', gap: '0.35rem' }}>
        {DOS_DONTS_VARIANTS.map((variant) => (
          <ToolbarButton
            key={variant}
            label={`${DOS_DONTS_META[variant].icon} ${DOS_DONTS_META[variant].label}`}
            title={`Inserir bloco ${DOS_DONTS_META[variant].label}`}
            onClick={() => insertDosDonts(variant)}
          />
        ))}
      </span>
      <ToolbarButton
        label="🧩 Embed"
        title="Inserir embed de componente"
        onClick={() => setPickerOpen(true)}
      />
      {pickerOpen && (
        <ComponentEmbedPicker
          onConfirm={(selection) => {
            setPickerOpen(false);
            insertEmbed(selection);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
      {state.inTable && (
        <span
          role="group"
          aria-label="Tabela"
          style={{ display: 'flex', gap: '0.35rem', paddingLeft: '0.5rem', borderLeft: '1px solid #ddd' }}
        >
          <ToolbarButton
            label="+Linha"
            title="Adicionar linha abaixo"
            onClick={() => chain().addRowAfter().run()}
          />
          <ToolbarButton
            label="−Linha"
            title="Remover linha"
            onClick={() => chain().deleteRow().run()}
          />
          <ToolbarButton
            label="+Coluna"
            title="Adicionar coluna à direita"
            onClick={() => chain().addColumnAfter().run()}
          />
          <ToolbarButton
            label="−Coluna"
            title="Remover coluna"
            onClick={() => chain().deleteColumn().run()}
          />
        </span>
      )}
    </div>
  );
}
