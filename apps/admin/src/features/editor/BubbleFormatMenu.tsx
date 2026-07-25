import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Code, Heading1, Heading2, Heading3, Italic, List, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Menu de formatação flutuante (TASK-102): substitui a toolbar fixa —
 * mesmas ações (títulos, negrito/itálico, listas, bloco de código), mas só
 * aparece sobre a seleção de texto, como o menu do `referencia-4.png`. Ícones
 * de "Improve with AI"/sublinhado/sobrescrito/citação/link do print de
 * referência ficaram de fora: nenhum desses marks/nodes existe no schema
 * (`extensions.ts`) e não é escopo desta task inventá-los — só reaproveitar
 * exatamente o que a `EditorToolbar` já oferecia.
 */

function BubbleButton({
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
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      // Mantém a seleção/foco no editor ao clicar (senão a seleção usada pelo
      // comando já teria colapsado antes do onClick rodar).
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-editorial-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4',
        active && 'bg-accent text-foreground',
      )}
    >
      {label}
    </button>
  );
}

export function BubbleFormatMenu({ editor }: { editor: Editor | null }) {
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
      },
  });

  if (!editor || !state) return null;

  const chain = () => editor.chain().focus();

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 8 }}
      role="toolbar"
      aria-label="Formatação"
      className="sb-bubble-menu flex items-center gap-0.5 rounded-editorial-md border border-border/80 bg-background p-1 shadow-editorial-md"
    >
      <BubbleButton
        label={<Heading1 />}
        title="Título 1"
        active={state.h1}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <BubbleButton
        label={<Heading2 />}
        title="Título 2"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <BubbleButton
        label={<Heading3 />}
        title="Título 3"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <BubbleButton
        label={<Bold />}
        title="Negrito (Cmd/Ctrl+B)"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <BubbleButton
        label={<Italic />}
        title="Itálico (Cmd/Ctrl+I)"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <BubbleButton
        label={<List />}
        title="Lista com marcadores"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      />
      <BubbleButton
        label={<ListOrdered />}
        title="Lista numerada"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <BubbleButton
        label={<Code />}
        title="Bloco de código"
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      />
    </BubbleMenu>
  );
}
