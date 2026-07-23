import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { Copy, GripVertical, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import {
  BLOCK_GROUPS,
  insertComponentEmbed,
  type BlockItem,
} from './blockInsert.js';
import { ComponentEmbedPicker, type ComponentEmbedSelection } from './ComponentEmbedPicker.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Controle inline por bloco (TASK-88, plano `# Inline Toolbar`): ao passar o
 * mouse sobre um bloco, revela na canaleta esquerda um "+" (Adicionar bloco →
 * abre o picker estilo lista da `referencia-2.png`) e um "⋮" (Mais ações →
 * duplicar / mover / excluir). Nada é sempre visível — a régua fica quieta até
 * o hover, para o conteúdo seguir sendo o protagonista.
 *
 * Rastreia o bloco **top-level** sob o cursor via `posAtCoords` → `$pos.before(1)`;
 * assim, ao passar sobre um parágrafo dentro de um callout/tabela, o controle se
 * alinha ao bloco inteiro (o "+" insere depois dele, o "Excluir" remove-o todo),
 * sem colidir com os controles internos do NodeView (ex.: o switcher do callout).
 */
export function BlockHandles({
  editor,
  canvasRef,
}: {
  editor: Editor;
  canvasRef: RefObject<HTMLDivElement | null>;
}) {
  const [hovered, setHovered] = useState<{ pos: number; top: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [embedAtPos, setEmbedAtPos] = useState<number | null>(null);
  const controlRef = useRef<HTMLDivElement>(null);

  const menuOpen = addOpen || actionsOpen || embedAtPos !== null;
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;

    function onMove(e: MouseEvent) {
      if (menuOpenRef.current) return;
      if (controlRef.current?.contains(e.target as Node)) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const info = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!info) return;
      const clamped = Math.min(info.pos, editor.state.doc.content.size);
      const $pos = editor.state.doc.resolve(clamped);
      if ($pos.depth === 0) return; // gap/entre blocos — mantém o último estado
      const blockPos = $pos.before(1);
      const nodeDom = editor.view.nodeDOM(blockPos);
      const el =
        nodeDom instanceof HTMLElement ? nodeDom : (nodeDom?.parentElement ?? null);
      if (!el) return;
      const cRect = canvas.getBoundingClientRect();
      const bRect = el.getBoundingClientRect();
      setHovered({ pos: blockPos, top: bRect.top - cRect.top });
    }

    function onLeave(e: MouseEvent) {
      if (menuOpenRef.current) return;
      if (controlRef.current?.contains(e.relatedTarget as Node)) return;
      setHovered(null);
    }

    dom.addEventListener('mousemove', onMove);
    dom.addEventListener('mouseleave', onLeave);
    return () => {
      dom.removeEventListener('mousemove', onMove);
      dom.removeEventListener('mouseleave', onLeave);
    };
  }, [editor, canvasRef]);

  if (!hovered) return null;

  const node = editor.state.doc.nodeAt(hovered.pos);
  const insertAt = node ? hovered.pos + node.nodeSize : hovered.pos;
  const index = editor.state.doc.resolve(hovered.pos).index(0);
  const count = editor.state.doc.childCount;

  const runInsert = (item: BlockItem) => {
    if (item.kind === 'embed') {
      setEmbedAtPos(insertAt);
      return;
    }
    item.insert?.(editor, insertAt);
  };

  return (
    <>
      <div
        ref={controlRef}
        className="sb-block-handle absolute z-10 flex items-center gap-0.5"
        style={{ top: hovered.top, left: 0 }}
        contentEditable={false}
        // Evita que o mousedown roube a seleção/foco do editor.
        onMouseDown={(e) => e.preventDefault()}
      >
        <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Adicionar bloco abaixo"
              title="Adicionar bloco"
              className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 items-center justify-center rounded-editorial-sm transition-colors"
            >
              <Plus className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 p-1.5 border-border/80 shadow-editorial-md rounded-editorial-md">
            {BLOCK_GROUPS.map((group, gi) => (
              <div key={group.label}>
                {gi > 0 && <DropdownMenuSeparator className="my-1" />}
                <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                  {group.label}
                </DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={() => runInsert(item)}
                    className="group flex items-center gap-2.5 rounded-editorial-sm px-2.5 py-1.5 text-sm font-medium text-foreground/90 hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
                  >
                    <item.icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground group-focus:text-foreground" />
                    <span>{item.label}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mais ações do bloco"
              title="Mais ações"
              className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 cursor-grab items-center justify-center rounded-editorial-sm"
            >
              <GripVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem
              onSelect={() => {
                if (node) editor.chain().focus().insertContentAt(insertAt, node.toJSON()).run();
              }}
            >
              <Copy className="size-4" />
              Duplicar bloco
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index <= 0} onSelect={() => moveBlock(editor, hovered.pos, -1)}>
              <ArrowUp className="size-4" />
              Mover para cima
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index >= count - 1}
              onSelect={() => moveBlock(editor, hovered.pos, 1)}
            >
              <ArrowDown className="size-4" />
              Mover para baixo
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                if (node)
                  editor
                    .chain()
                    .focus()
                    .deleteRange({ from: hovered.pos, to: hovered.pos + node.nodeSize })
                    .run();
                setHovered(null);
              }}
            >
              <Trash2 className="size-4" />
              Excluir bloco
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {embedAtPos !== null && (
        <ComponentEmbedPicker
          onConfirm={(selection: ComponentEmbedSelection) => {
            insertComponentEmbed(editor, embedAtPos, selection);
            setEmbedAtPos(null);
          }}
          onCancel={() => setEmbedAtPos(null)}
        />
      )}
    </>
  );
}

/**
 * Move o bloco top-level em `pos` uma posição para cima/baixo, trocando com o
 * irmão. Feito com uma transação delete+insert (o node do ProseMirror é
 * reinserido íntegro), já que o Tiptap não tem um comando "mover bloco" nativo.
 */
function moveBlock(editor: Editor, pos: number, dir: -1 | 1) {
  const { doc } = editor.state;
  const node = doc.nodeAt(pos);
  if (!node) return;
  const index = doc.resolve(pos).index(0);
  const target = index + dir;
  if (target < 0 || target >= doc.childCount) return;

  const from = pos;
  const to = pos + node.nodeSize;
  let tr = editor.state.tr.delete(from, to);
  const insertPos =
    dir === -1 ? from - doc.child(index - 1).nodeSize : from + doc.child(index + 1).nodeSize;
  tr = tr.insert(insertPos, node);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
}
