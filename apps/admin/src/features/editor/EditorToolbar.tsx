import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { Bold, Code, Heading1, Heading2, Heading3, Italic, List, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ToolbarButton({
  label,
  title,
  active = false,
  onClick,
}: {
  label: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      title={title}
      aria-pressed={active}
      aria-label={title}
      // onMouseDown+preventDefault mantém a seleção/foco no editor ao clicar
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/**
 * Toolbar de **formatação** do editor (TASK-26/27, reconciliada na TASK-88).
 *
 * Divisão de responsabilidades após a TASK-88: **inserir** blocos novos é papel
 * do controle inline "+" por bloco (`BlockHandles`) — caminho único de inserção.
 * Esta toolbar guarda só o que age sobre a **linha atual**: marcas (negrito/
 * itálico), toggles de tipo de bloco (títulos, listas, código) e os controles
 * contextuais de tabela (linhas/colunas). Os botões de inserir tabela/callout/
 * dos-donts/embed foram removidos daqui para não haver dois caminhos de inserção.
 *
 * Os estados ativos vêm de useEditorState — no Tiptap v3 o useEditor não
 * re-renderiza a cada transação por padrão.
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
    <div role="toolbar" aria-label="Formatação" className="mb-2 flex flex-wrap items-center gap-1.5">
      <ToolbarButton
        label={<Heading1 />}
        title="Título 1"
        active={state.h1}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        label={<Heading2 />}
        title="Título 2"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label={<Heading3 />}
        title="Título 3"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarButton
        label={<Bold />}
        title="Negrito (Cmd/Ctrl+B)"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <ToolbarButton
        label={<Italic />}
        title="Itálico (Cmd/Ctrl+I)"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <ToolbarButton
        label={<List />}
        title="Lista com marcadores"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      />
      <ToolbarButton
        label={<ListOrdered />}
        title="Lista numerada"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarButton
        label={<Code />}
        title="Bloco de código"
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      />
      {state.inTable && (
        <span role="group" aria-label="Tabela" className="flex gap-1.5 border-l pl-2">
          <ToolbarButton
            label="+Linha"
            title="Adicionar linha abaixo"
            onClick={() => chain().addRowAfter().run()}
          />
          <ToolbarButton label="−Linha" title="Remover linha" onClick={() => chain().deleteRow().run()} />
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
