import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Menu de formatação flutuante (TASK-102): substitui a toolbar fixa —
 * mesmas ações (títulos, negrito/itálico, listas, bloco de código), mas só
 * aparece sobre a seleção de texto, como o menu do `referencia-4.png`. Ícones
 * de "Improve with AI"/sublinhado/sobrescrito/citação do print de referência
 * ficaram de fora: nenhum desses marks/nodes existe no schema
 * (`extensions.ts`) e não é escopo desta task inventá-los — só reaproveitar
 * exatamente o que a `EditorToolbar` já oferecia (link adicionado depois,
 * SYS-29).
 */

/** Prepende `https://` quando o usuário digita sem protocolo (ex.: "exemplo.com"). */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

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
        link: e.isActive('link'),
      },
  });

  if (!editor || !state) return null;

  const chain = () => editor.chain().focus();
  const isLinkActive = state.link;

  function toggleLink() {
    if (isLinkActive) {
      chain().unsetLink().run();
      return;
    }
    const url = window.prompt('Link URL');
    if (!url || !url.trim()) return;
    chain().setLink({ href: normalizeUrl(url) }).run();
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 8 }}
      role="toolbar"
      aria-label="Formatting"
      className="sb-bubble-menu flex items-center gap-0.5 rounded-editorial-md border border-border/80 bg-background p-1 shadow-editorial-md"
    >
      <BubbleButton
        label={<Heading1 />}
        title="Heading 1"
        active={state.h1}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <BubbleButton
        label={<Heading2 />}
        title="Heading 2"
        active={state.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <BubbleButton
        label={<Heading3 />}
        title="Heading 3"
        active={state.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <BubbleButton
        label={<Bold />}
        title="Bold (Cmd/Ctrl+B)"
        active={state.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <BubbleButton
        label={<Italic />}
        title="Italic (Cmd/Ctrl+I)"
        active={state.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <BubbleButton
        label={<LinkIcon />}
        title={state.link ? 'Remove link' : 'Add link'}
        active={state.link}
        onClick={toggleLink}
      />
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <BubbleButton
        label={<List />}
        title="Bulleted list"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      />
      <BubbleButton
        label={<ListOrdered />}
        title="Numbered list"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <BubbleButton
        label={<Code />}
        title="Code block"
        active={state.codeBlock}
        onClick={() => chain().toggleCodeBlock().run()}
      />
    </BubbleMenu>
  );
}
