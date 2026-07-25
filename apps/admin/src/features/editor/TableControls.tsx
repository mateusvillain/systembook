import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { Plus, Rows2, X } from 'lucide-react';

/**
 * Controles de tabela por hover (TASK-100): substitui o grupo de botões
 * +Linha/−Linha/+Coluna/−Coluna que vivia sempre visível na `EditorToolbar`.
 * Ao passar o mouse sobre uma tabela, revela uma régua acima (colunas) e uma
 * à esquerda (linhas) com pontos de inserção em posições específicas — não
 * apenas "adicionar no fim" — mais um botão por linha/coluna para removê-la,
 * e um botão no canto superior esquerdo para alternar se a primeira linha é
 * cabeçalho (`toggleHeaderRow`, comando nativo do `@tiptap/extension-table`).
 *
 * Reaproveita o padrão de rastreamento de hover da `BlockHandles` (mousemove
 * no DOM do editor, sem depender de eventos de foco/seleção) e, como o
 * layout de uma tabela muda a cada inserção/remoção, recalcula a geometria a
 * cada transação enquanto uma tabela estiver "hovered".
 */

interface TableGeometry {
  pos: number;
  /** Retângulo da tabela relativo ao `canvasRef` (mesmo referencial da BlockHandles). */
  rect: { top: number; left: number };
  /** Fronteiras de coluna (x) e linha (y), relativas ao canvas; length = count+1. */
  colBounds: number[];
  rowBounds: number[];
}

function findTableElement(editor: Editor, tablePos: number): HTMLTableElement | null {
  const dom = editor.view.nodeDOM(tablePos);
  if (!(dom instanceof HTMLElement)) return null;
  if (dom instanceof HTMLTableElement) return dom;
  return dom.querySelector('table');
}

function readGeometry(
  editor: Editor,
  canvas: HTMLElement,
  tablePos: number,
): TableGeometry | null {
  const tableEl = findTableElement(editor, tablePos);
  if (!tableEl) return null;
  const rows = Array.from(tableEl.rows);
  const firstRow = rows[0];
  if (!firstRow) return null;

  const canvasRect = canvas.getBoundingClientRect();
  const tableRect = tableEl.getBoundingClientRect();

  const colBounds = [tableRect.left - canvasRect.left];
  for (const cell of Array.from(firstRow.cells)) {
    colBounds.push(cell.getBoundingClientRect().right - canvasRect.left);
  }

  const rowBounds = [tableRect.top - canvasRect.top];
  for (const row of rows) {
    rowBounds.push(row.getBoundingClientRect().bottom - canvasRect.top);
  }

  return {
    pos: tablePos,
    rect: { top: tableRect.top - canvasRect.top, left: tableRect.left - canvasRect.left },
    colBounds,
    rowBounds,
  };
}

/** Move a seleção para dentro da célula (rowIndex, colIndex) da tabela em `tablePos`. */
function selectCell(editor: Editor, tablePos: number, rowIndex: number, colIndex: number): boolean {
  const tableEl = findTableElement(editor, tablePos);
  const cell = tableEl?.rows[rowIndex]?.cells[colIndex];
  if (!cell) return false;
  const pos = editor.view.posAtDOM(cell, 0);
  editor.chain().setTextSelection(pos).run();
  return true;
}

const controlButtonClass =
  'pointer-events-auto absolute flex size-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground shadow-sm transition-colors hover:border-foreground/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-0';

export function TableControls({
  editor,
  canvasRef,
}: {
  editor: Editor;
  canvasRef: RefObject<HTMLDivElement | null>;
}) {
  const [hoveredPos, setHoveredPos] = useState<number | null>(null);
  const [geometry, setGeometry] = useState<TableGeometry | null>(null);
  const controlRef = useRef<HTMLDivElement>(null);

  const recompute = useCallback(() => {
    const canvas = canvasRef.current;
    if (hoveredPos == null || !canvas) {
      setGeometry(null);
      return;
    }
    setGeometry(readGeometry(editor, canvas, hoveredPos));
  }, [editor, canvasRef, hoveredPos]);

  useEffect(recompute, [recompute]);

  // O layout da tabela muda a cada addRowAfter/deleteColumn/etc — recalcula
  // a geometria a cada transação enquanto uma tabela estiver hovered.
  useEffect(() => {
    if (hoveredPos == null) return;
    const handler = () => recompute();
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor, hoveredPos, recompute]);

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;

    function onMove(e: MouseEvent) {
      const tableEl = (e.target as HTMLElement).closest('table');
      if (!tableEl) {
        setHoveredPos(null);
        return;
      }
      const domPos = editor.view.posAtDOM(tableEl, 0);
      const $pos = editor.state.doc.resolve(domPos);
      let depth = $pos.depth;
      while (depth > 0 && $pos.node(depth).type.name !== 'table') depth--;
      if ($pos.node(depth).type.name !== 'table') {
        setHoveredPos(null);
        return;
      }
      setHoveredPos($pos.before(depth));
    }

    function onLeave(e: MouseEvent) {
      // Se o cursor está indo para os controles flutuantes (fora do dom do
      // editor, mas visualmente sobre a tabela), mantém o estado — só limpa
      // ao sair de fato da área da tabela/controles.
      if (controlRef.current?.contains(e.relatedTarget as Node)) return;
      setHoveredPos(null);
    }

    dom.addEventListener('mousemove', onMove);
    dom.addEventListener('mouseleave', onLeave);
    return () => {
      dom.removeEventListener('mousemove', onMove);
      dom.removeEventListener('mouseleave', onLeave);
    };
  }, [editor]);

  if (!geometry) return null;

  const { pos: tablePos, rect, colBounds, rowBounds } = geometry;
  const numCols = colBounds.length - 1;
  const numRows = rowBounds.length - 1;
  const railOffset = 16;

  const insertColumnAt = (boundaryIndex: number) => {
    const colIndex = boundaryIndex < numCols ? boundaryIndex : numCols - 1;
    if (!selectCell(editor, tablePos, 0, colIndex)) return;
    editor
      .chain()
      .focus()
      [boundaryIndex < numCols ? 'addColumnBefore' : 'addColumnAfter']()
      .run();
  };

  const removeColumn = (colIndex: number) => {
    if (numCols <= 1) return;
    if (!selectCell(editor, tablePos, 0, colIndex)) return;
    editor.chain().focus().deleteColumn().run();
  };

  const insertRowAt = (boundaryIndex: number) => {
    const rowIndex = boundaryIndex < numRows ? boundaryIndex : numRows - 1;
    if (!selectCell(editor, tablePos, rowIndex, 0)) return;
    editor
      .chain()
      .focus()
      [boundaryIndex < numRows ? 'addRowBefore' : 'addRowAfter']()
      .run();
  };

  const removeRow = (rowIndex: number) => {
    if (numRows <= 1) return;
    if (!selectCell(editor, tablePos, rowIndex, 0)) return;
    editor.chain().focus().deleteRow().run();
  };

  const toggleHeaderRow = () => {
    if (!selectCell(editor, tablePos, 0, 0)) return;
    editor.chain().focus().toggleHeaderRow().run();
  };

  return (
    <div
      ref={controlRef}
      className="sb-table-controls pointer-events-none absolute inset-0 z-10"
      contentEditable={false}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className={controlButtonClass}
        style={{ left: rect.left - railOffset, top: rect.top - railOffset }}
        title="Alternar linha de cabeçalho"
        aria-label="Alternar linha de cabeçalho"
        onClick={toggleHeaderRow}
      >
        <Rows2 className="size-3" />
      </button>

      {colBounds.map((x, i) => (
        <button
          key={`col-insert-${i}`}
          type="button"
          className={controlButtonClass}
          style={{ left: x, top: rect.top - railOffset }}
          title="Adicionar coluna"
          aria-label={`Adicionar coluna na posição ${i + 1}`}
          onClick={() => insertColumnAt(i)}
        >
          <Plus className="size-3" />
        </button>
      ))}
      {Array.from({ length: numCols }, (_, i) => (colBounds[i]! + colBounds[i + 1]!) / 2).map((cx, i) => (
        <button
          key={`col-remove-${i}`}
          type="button"
          className={controlButtonClass}
          style={{ left: cx, top: rect.top - railOffset }}
          title="Remover coluna"
          aria-label={`Remover coluna ${i + 1}`}
          disabled={numCols <= 1}
          onClick={() => removeColumn(i)}
        >
          <X className="size-3" />
        </button>
      ))}

      {rowBounds.map((y, i) => (
        <button
          key={`row-insert-${i}`}
          type="button"
          className={controlButtonClass}
          style={{ left: rect.left - railOffset, top: y }}
          title="Adicionar linha"
          aria-label={`Adicionar linha na posição ${i + 1}`}
          onClick={() => insertRowAt(i)}
        >
          <Plus className="size-3" />
        </button>
      ))}
      {Array.from({ length: numRows }, (_, i) => (rowBounds[i]! + rowBounds[i + 1]!) / 2).map((cy, i) => (
        <button
          key={`row-remove-${i}`}
          type="button"
          className={controlButtonClass}
          style={{ left: rect.left - railOffset, top: cy }}
          title="Remover linha"
          aria-label={`Remover linha ${i + 1}`}
          disabled={numRows <= 1}
          onClick={() => removeRow(i)}
        >
          <X className="size-3" />
        </button>
      ))}
    </div>
  );
}
