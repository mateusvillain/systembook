import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';

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

  if (!editor || !state) return null;

  const chain = () => editor.chain().focus();

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
