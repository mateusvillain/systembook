import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  GripHorizontal,
  GripVertical,
  Plus,
  Rows2,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Controles de tabela por hover (TASK-100, redesenhados): ao passar o mouse sobre
 * uma tabela, aparecem
 *  - uma **alça por coluna** (acima) e **por linha** (à esquerda) que abre um menu
 *    com ações nomeadas — "Insert row above/below", "Delete row", etc. — e destaca
 *    a linha/coluna alvo. Antes eram dezenas de bolinhas idênticas (+ e ×) em cada
 *    fronteira, e só o `title` dizia o que cada uma fazia;
 *  - um "+" explícito no fim de cada eixo (nova coluna à direita, nova linha
 *    abaixo), o caso mais comum;
 *  - o botão do canto para alternar a primeira linha como cabeçalho
 *    (`toggleHeaderRow`, comando nativo do `@tiptap/extension-table`).
 *
 * Não há reordenar linhas/colunas: o `@tiptap/extension-table` não tem comando
 * para isso. O ícone de pontos ao lado da tabela é o da `BlockHandles` e move o
 * bloco inteiro.
 *
 * Reaproveita o rastreamento de hover da `BlockHandles` (mousemove no DOM do
 * editor) e recalcula a geometria a cada transação enquanto uma tabela estiver
 * "hovered".
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

/**
 * Folga em volta da tabela onde os controles continuam visíveis. Os botões vivem
 * nas réguas (alças à esquerda/acima) e nos "+" do fim de cada eixo (à direita/
 * abaixo); o vão entre a tabela e eles não é parte da `<table>`, então sem esta
 * zona o ponteiro "saía" da tabela a caminho do botão, os controles desmontavam e
 * o clique nunca chegava.
 */
const RAIL_ZONE = { left: 36, top: 36, right: 40, bottom: 40 };

/** O ponto (viewport) está sobre a tabela `tablePos` ou na zona dos controles dela? */
function inTableZone(editor: Editor, tablePos: number, x: number, y: number): boolean {
  const tableEl = findTableElement(editor, tablePos);
  if (!tableEl) return false;
  const r = tableEl.getBoundingClientRect();
  return (
    x >= r.left - RAIL_ZONE.left &&
    x <= r.right + RAIL_ZONE.right &&
    y >= r.top - RAIL_ZONE.top &&
    y <= r.bottom + RAIL_ZONE.bottom
  );
}

// `p-0`: sem o preflight do Tailwind o <button> herda o padding nativo do navegador
// (1px 6px), que espreme o ícone das alças estreitas.
const chipClass =
  'pointer-events-auto absolute box-border flex items-center justify-center border border-border p-0 bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground data-[state=open]:border-primary data-[state=open]:bg-accent data-[state=open]:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none';

/** Alça de linha/coluna: pílula fina com pontos de arrasto, centrada na régua. */
const handleClass = cn(chipClass, 'rounded-md');
/** "+" do fim de cada eixo e botão do canto: quadrado discreto com ícone. */
const addClass = cn(chipClass, 'size-6 rounded-md');

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
  // Espelho de `hoveredPos` para os listeners do DOM (registrados uma vez) lerem
  // a tabela atual sem reassinar a cada mudança.
  const hoveredPosRef = useRef<number | null>(null);
  hoveredPosRef.current = hoveredPos;
  // Menu de alça aberto: o conteúdo vai para um portal (fora do DOM do editor e
  // dos controles), então o ponteiro "sai" de tudo ao entrar nele — enquanto
  // estiver aberto nada esconde os controles (senão o menu desmontaria junto).
  const menuOpenRef = useRef(false);
  // Linha/coluna destacada (hover na alça ou menu aberto).
  const [hot, setHot] = useState<{ axis: 'row' | 'col'; index: number } | null>(null);

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

  // Sem tabela (ou sem hover) não há menu aberto nem linha destacada: o menu pode
  // desmontar aberto (p.ex. apagar a última coluna remove a própria alça) sem
  // disparar `onOpenChange(false)`, e o ref ficaria preso em `true`.
  useEffect(() => {
    if (!geometry) {
      menuOpenRef.current = false;
      setHot(null);
    }
  }, [geometry]);

  // Rede de segurança: com os controles visíveis, qualquer movimento fora da
  // tabela, dos botões e da zona de tolerância esconde. Cobre saídas que nenhum
  // handler acima vê (o `mouseleave` do editor já passou e o container dos
  // botões é `pointer-events-none`), p.ex. sair pelo vão entre dois botões.
  useEffect(() => {
    if (hoveredPos == null) return;
    function onDocMove(e: MouseEvent) {
      const target = e.target as Node;
      if (controlRef.current?.contains(target) || editor.view.dom.contains(target)) return;
      if (menuOpenRef.current) return;
      if (!inTableZone(editor, hoveredPos!, e.clientX, e.clientY)) setHoveredPos(null);
    }
    document.addEventListener('mousemove', onDocMove);
    return () => document.removeEventListener('mousemove', onDocMove);
  }, [editor, hoveredPos]);

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;

    function onMove(e: MouseEvent) {
      if (menuOpenRef.current) return;
      const tableEl = (e.target as HTMLElement).closest('table');
      if (!tableEl) {
        // Fora da tabela, mas ainda a caminho dos controles: mantém.
        const current = hoveredPosRef.current;
        if (current != null && inTableZone(editor, current, e.clientX, e.clientY)) return;
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
      if (menuOpenRef.current) return;
      // Se o cursor está indo para os controles flutuantes (fora do dom do
      // editor, mas visualmente sobre a tabela), mantém o estado — só limpa
      // ao sair de fato da área da tabela/controles.
      if (controlRef.current?.contains(e.relatedTarget as Node)) return;
      // A régua fica fora do DOM do editor: sair para ela também é "leave".
      const current = hoveredPosRef.current;
      if (current != null && inTableZone(editor, current, e.clientX, e.clientY)) return;
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
  const tableRight = colBounds[numCols]!;
  const tableBottom = rowBounds[numRows]!;
  /** Distância do centro das alças/botões à borda da tabela. */
  const railOffset = 14;

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

  // Ação de menu: o item fecha o menu, mas se a ação remove a própria alça (apagar
  // a última coluna/linha) o `onOpenChange(false)` não chega — encerra aqui.
  const act = (run: () => void) => () => {
    menuOpenRef.current = false;
    setHot(null);
    run();
  };

  const onMenuOpenChange = (axis: 'row' | 'col', index: number) => (open: boolean) => {
    menuOpenRef.current = open;
    setHot(open ? { axis, index } : null);
  };

  return (
    <div
      ref={controlRef}
      className="sb-table-controls pointer-events-none absolute inset-0 z-10"
      contentEditable={false}
      onMouseDown={(e) => e.preventDefault()}
      // Saindo dos botões: de volta ao editor, o `mousemove` decide; para qualquer
      // outro lugar fora da zona, esconde (senão os controles ficariam presos).
      onMouseLeave={(e) => {
        if (menuOpenRef.current) return;
        const back = editor.view.dom.contains(e.relatedTarget as Node);
        if (!back && !inTableZone(editor, tablePos, e.clientX, e.clientY)) setHoveredPos(null);
      }}
    >
      {/* Destaque da linha/coluna alvo: liga a alça ao que ela vai alterar. */}
      {hot && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-sm bg-primary/5 ring-1 ring-primary/40"
          style={
            hot.axis === 'row'
              ? {
                  left: rect.left,
                  top: rowBounds[hot.index]!,
                  width: tableRight - rect.left,
                  height: rowBounds[hot.index + 1]! - rowBounds[hot.index]!,
                }
              : {
                  left: colBounds[hot.index]!,
                  top: rect.top,
                  width: colBounds[hot.index + 1]! - colBounds[hot.index]!,
                  height: tableBottom - rect.top,
                }
          }
        />
      )}

      <button
        type="button"
        className={cn(addClass, '-translate-x-1/2 -translate-y-1/2')}
        style={{ left: rect.left - railOffset, top: rect.top - railOffset }}
        title="Toggle header row"
        aria-label="Toggle header row"
        onClick={toggleHeaderRow}
      >
        <Rows2 className="size-3.5" />
      </button>

      {/* Colunas: uma alça por coluna, acima, com o menu de ações. */}
      {Array.from({ length: numCols }, (_, i) => i).map((i) => {
        const cx = (colBounds[i]! + colBounds[i + 1]!) / 2;
        const label = `Column ${i + 1}`;
        return (
          <DropdownMenu key={`col-${i}`} modal={false} onOpenChange={onMenuOpenChange('col', i)}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(handleClass, 'h-4 w-8 -translate-x-1/2 -translate-y-1/2')}
                style={{ left: cx, top: rect.top - railOffset }}
                title={`${label} actions`}
                aria-label={`${label} actions`}
                onMouseEnter={() => setHot({ axis: 'col', index: i })}
                onMouseLeave={() => !menuOpenRef.current && setHot(null)}
              >
                <GripHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuItem onSelect={act(() => insertColumnAt(i))}>
                <ArrowLeftToLine />
                Insert column left
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={act(() => insertColumnAt(i + 1))}>
                <ArrowRightToLine />
                Insert column right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={numCols <= 1}
                onSelect={act(() => removeColumn(i))}
              >
                <Trash2 />
                Delete column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}

      {/* Linhas: uma alça por linha, à esquerda, com o menu de ações. */}
      {Array.from({ length: numRows }, (_, i) => i).map((i) => {
        const cy = (rowBounds[i]! + rowBounds[i + 1]!) / 2;
        const label = `Row ${i + 1}`;
        return (
          <DropdownMenu key={`row-${i}`} modal={false} onOpenChange={onMenuOpenChange('row', i)}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(handleClass, 'h-8 w-4 -translate-x-1/2 -translate-y-1/2')}
                style={{ left: rect.left - railOffset, top: cy }}
                title={`${label} actions`}
                aria-label={`${label} actions`}
                onMouseEnter={() => setHot({ axis: 'row', index: i })}
                onMouseLeave={() => !menuOpenRef.current && setHot(null)}
              >
                <GripVertical className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="right"
              align="start"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuItem onSelect={act(() => insertRowAt(i))}>
                <ArrowUpToLine />
                Insert row above
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={act(() => insertRowAt(i + 1))}>
                <ArrowDownToLine />
                Insert row below
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={numRows <= 1}
                onSelect={act(() => removeRow(i))}
              >
                <Trash2 />
                Delete row
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}

      {/* "+" no fim de cada eixo: o caso mais comum, sem abrir menu. */}
      <button
        type="button"
        className={cn(addClass, '-translate-y-1/2')}
        style={{ left: tableRight + 8, top: rect.top + (rowBounds[1]! - rect.top) / 2 }}
        title="Add column"
        aria-label="Add column at the end"
        onClick={() => insertColumnAt(numCols)}
      >
        <Plus className="size-3.5" />
      </button>
      <button
        type="button"
        className={cn(addClass, '-translate-x-1/2')}
        style={{ left: rect.left + (colBounds[1]! - rect.left) / 2, top: tableBottom + 8 }}
        title="Add row"
        aria-label="Add row at the end"
        onClick={() => insertRowAt(numRows)}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
