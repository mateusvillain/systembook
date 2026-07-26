import { useRef, useState, type ComponentProps, type DragEvent, type KeyboardEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Reordenação por drag-and-drop das listas de navegação (TASK-108): menus do
 * header, seções e páginas da sidebar. Substitui os antigos itens "Mover para
 * cima/baixo" do `RowActionsMenu` por um grip revelado no hover — mesmo padrão
 * `opacity-0 group-hover:opacity-100` do gatilho "⋯".
 *
 * DnD nativo do HTML5 (sem dependência nova): o grip por linha é `draggable`;
 * a linha inteira é a zona de drop. A borda de inserção (antes/depois) é
 * decidida pela metade sob o ponteiro e desenhada por `[data-drop-edge]` em
 * `index.css`. A reordenação é sempre escopada ao mesmo pai — o `onReorder`
 * recebe os `orderedIds` recomputados e chama a mesma mutation `reorder` que os
 * handlers de mover-para-cima/baixo chamavam.
 *
 * O grip continua acessível por teclado (as setas movem o item), preservando a
 * reordenação sem mouse que os itens de menu davam — DnD nativo sozinho não é
 * operável por teclado.
 */

type Orientation = 'vertical' | 'horizontal';
type Edge = 'before' | 'after';

export function useDragReorder<T extends { id: string }>({
  items,
  onReorder,
  orientation = 'vertical',
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  orientation?: Orientation;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; edge: Edge } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement | null>());

  function reset() {
    setDragId(null);
    setDrop(null);
  }

  function commit(fromId: string, toId: string, edge: Edge) {
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(fromId);
    if (from < 0) return;
    ids.splice(from, 1);
    let to = ids.indexOf(toId);
    if (to < 0) return;
    if (edge === 'after') to += 1;
    ids.splice(to, 0, fromId);
    // Solto na mesma posição: nada muda, não dispara mutation.
    if (ids.every((id, i) => id === items[i]!.id)) return;
    onReorder(ids);
  }

  function moveByKeyboard(index: number, delta: -1 | 1) {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    const ids = items.map((i) => i.id);
    ids.splice(to, 0, ids.splice(index, 1)[0]!);
    onReorder(ids);
  }

  return {
    /** Verdadeiro enquanto algum item está sendo arrastado (atenua a lista). */
    isDragging: dragId != null,

    /** Props da linha inteira (zona de drop + registro do ref p/ drag image). */
    getRowProps(id: string) {
      const isTarget = drop?.id === id && dragId !== id;
      return {
        ref: (el: HTMLElement | null) => {
          rowRefs.current.set(id, el);
        },
        'data-dragging': dragId === id ? '' : undefined,
        'data-drop-edge': isTarget ? drop!.edge : undefined,
        'data-sortable': orientation,
        onDragOver: (e: DragEvent) => {
          if (!dragId || dragId === id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const rect = e.currentTarget.getBoundingClientRect();
          const edge: Edge =
            orientation === 'vertical'
              ? e.clientY < rect.top + rect.height / 2
                ? 'before'
                : 'after'
              : e.clientX < rect.left + rect.width / 2
                ? 'before'
                : 'after';
          setDrop({ id, edge });
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          if (dragId && drop) commit(dragId, drop.id, drop.edge);
          reset();
        },
      };
    },

    /** Props do grip: inicia o drag e opera por teclado (setas). */
    getHandleProps(id: string, index: number) {
      return {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          setDragId(id);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id);
          const row = rowRefs.current.get(id);
          if (row) e.dataTransfer.setDragImage(row, 12, 12);
        },
        onDragEnd: reset,
        onKeyDown: (e: KeyboardEvent) => {
          const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
          const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
          if (e.key === prevKey) {
            e.preventDefault();
            moveByKeyboard(index, -1);
          } else if (e.key === nextKey) {
            e.preventDefault();
            moveByKeyboard(index, 1);
          }
        },
      };
    },
  };
}

/** Props que a linha inteira recebe (zona de drop). */
export type DragRowProps = ReturnType<ReturnType<typeof useDragReorder>['getRowProps']>;
/** Props que o grip recebe (inicia o drag / setas do teclado). */
export type DragHandleProps = ReturnType<ReturnType<typeof useDragReorder>['getHandleProps']>;

/** Grip revelado no hover — mesma silhueta size-6 do gatilho "⋯" do RowActionsMenu. */
export function DragHandle({
  label,
  className,
  ...props
}: { label: string } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title="Drag (or use the arrow keys) to reorder"
      className={cn(
        'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-editorial-sm transition-colors active:cursor-grabbing',
        className,
      )}
      {...props}
    >
      <GripVertical className="size-3.5" />
    </button>
  );
}
