import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  BLOCK_GROUPS,
  filterBlockGroupsForContext,
  getBlockInsertContext,
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
 * Controle inline por bloco (TASK-88, plano `# Inline Toolbar`; drag-and-drop
 * na TASK-107): ao passar o mouse sobre um bloco, revela na canaleta esquerda
 * um "+" (Adicionar bloco → abre o picker estilo lista da `referencia-2.png`)
 * e um "⋮" que agora é ao mesmo tempo grip de arrastar (reordena o bloco,
 * `@tiptap/extension-drag-handle-react`) e trigger do menu "Mais ações"
 * (duplicar/excluir — mover para cima/baixo saiu, o drag cobre o mesmo caso).
 *
 * O `<DragHandle>` oficial do Tiptap assume o rastreamento de hover e o
 * posicionamento (substitui o `posAtCoords`/`canvasRef` manual que este
 * componente usava desde a TASK-88) e já entrega `node`/`pos` do bloco **top-level** sob o
 * cursor via `onNodeChange` — mesma granularidade de bloco inteiro que a
 * versão anterior tinha (o "+" insere depois dele, o "Excluir" remove-o
 * todo), sem colidir com os controles internos do NodeView (ex.: o switcher
 * do callout).
 */
export function BlockHandles({ editor }: { editor: Editor }) {
  const [current, setCurrent] = useState<{ node: PMNode | null; pos: number }>({ node: null, pos: -1 });
  const [addOpen, setAddOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [embedAtPos, setEmbedAtPos] = useState<number | null>(null);

  const menuOpen = addOpen || actionsOpen || embedAtPos !== null;

  // Identidade estável: o `useEffect` interno do `<DragHandle>` depende desta
  // prop — uma arrow function inline recriada a cada render faria o efeito
  // desmontar/remontar o plugin a cada hover (resetando `visibility:hidden`
  // logo depois do handle aparecer, escondendo-o de novo silenciosamente).
  const onNodeChange = useCallback(
    ({ node: n, pos: p }: { node: PMNode | null; editor: Editor; pos: number }) => setCurrent({ node: n, pos: p }),
    [],
  );

  // Trava o handle (sem isso, mover o mouse do grip pro conteúdo do dropdown
  // — que o Radix porta pra fora do wrapper do DragHandle — dispara o
  // `mouseleave` interno do plugin e esconde/reposiciona o handle enquanto o
  // menu ainda está aberto).
  useEffect(() => {
    editor.commands.setMeta('lockDragHandle', menuOpen);
  }, [editor, menuOpen]);

  const { node, pos } = current;
  const insertAt = node ? pos + node.nodeSize : 0;
  // TASK-101: filtra o registro pelo contexto da posição de inserção (dentro
  // de um callout/célula de tabela não permite tabela/callout aninhados).
  const insertableGroups = filterBlockGroupsForContext(BLOCK_GROUPS, getBlockInsertContext(editor, insertAt));

  const runInsert = (item: BlockItem) => {
    if (item.kind === 'embed') {
      setEmbedAtPos(insertAt);
      return;
    }
    item.insert?.(editor, insertAt);
  };

  return (
    <>
      <DragHandle
        editor={editor}
        onNodeChange={onNodeChange}
        className="sb-block-handle flex items-center gap-0.5"
      >
        <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              draggable={false}
              aria-label="Adicionar bloco abaixo"
              title="Adicionar bloco"
              onMouseDown={(e) => e.preventDefault()}
              className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 items-center justify-center rounded-editorial-sm transition-colors"
            >
              <Plus className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 p-1.5 border-border/80 shadow-editorial-md rounded-editorial-md">
            {insertableGroups.map((group, gi) => (
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
              // Explícito (em vez de confiar só na herança do `draggable=true`
              // que o `<DragHandle>` aplica no container pai) — sem isto o
              // arrastar a partir deste botão especificamente não iniciava.
              draggable
              aria-label="Arrastar para reordenar; clique para mais ações"
              title="Arrastar para reordenar · clique para mais ações"
              className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 cursor-grab items-center justify-center rounded-editorial-sm active:cursor-grabbing"
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                if (node) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
              }}
            >
              <Trash2 className="size-4" />
              Excluir bloco
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DragHandle>

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
