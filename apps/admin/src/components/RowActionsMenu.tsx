import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Menu de ações contextuais de uma linha/item (TASK-89).
 *
 * Consolida o padrão "Renomear / Mover / Excluir" que antes vivia duplicado em
 * três lugares — a nav de menus do header (TASK-85), o tab bar do editor
 * (TASK-86) e a antiga fileira de 4 ícones da sidebar. Segue o
 * `plano-de-interface.md` (`# Ações`: "evitar botões espalhados, priorizar
 * ações contextuais" — `Página ⋮ Renomear / …`): um único gatilho de overflow
 * no lugar de vários botões sempre visíveis, deixando a estrutura calma.
 *
 * "Renomear" apenas dispara `onRename` (o call site reusa sua própria edição
 * inline — não abrimos modal). "Duplicar" e "Mover entre seções" do exemplo do
 * plano ficam de fora de propósito: não há mutation de backend para nenhum dos
 * dois hoje (só reorder dentro do mesmo pai), então não expomos UI morta.
 *
 * Todo item leva ícone (o `DropdownMenuItem` já dimensiona e colore o `svg`):
 * menu com ícone em só alguns itens desalinha os rótulos.
 *
 * Mover para cima/baixo somem quando `onMovePrev`/`onMoveNext` são omitidos —
 * o call site passa `undefined` na primeira/última posição, espelhando o antigo
 * comportamento `invisible`. Acessível por teclado por padrão (shadcn
 * `DropdownMenu`).
 *
 * TASK-108: a nav de menus do header e a árvore de seções/páginas migraram a
 * reordenação para drag-and-drop (grip no hover, `useDragReorder`) e não passam
 * mais `onMovePrev`/`onMoveNext`. Os props seguem aqui para os call sites ainda
 * baseados em mover-para-cima/baixo — o tab bar do editor e as status tags.
 */
export function RowActionsMenu({
  triggerLabel,
  onRename,
  onMovePrev,
  onMoveNext,
  movePrevLabel = 'Move up',
  moveNextLabel = 'Move down',
  movePrevIcon: MovePrevIcon = ArrowUp,
  moveNextIcon: MoveNextIcon = ArrowDown,
  onDelete,
  align = 'start',
  triggerClassName,
  extraItems,
}: {
  /** aria-label completo do gatilho (ex.: "Mais ações da seção X"). */
  triggerLabel: string;
  onRename: () => void;
  /**
   * Itens extra do contexto (TASK-109: "Copiar link", "Mover para outro menu"),
   * renderizados após "Renomear" e antes de mover/excluir. O call site monta os
   * `DropdownMenuItem`/`DropdownMenuSub` — o componente segue agnóstico.
   */
  extraItems?: ReactNode;
  /** Omitir esconde "Mover para cima" (item já está na primeira posição). */
  onMovePrev?: () => void;
  /** Omitir esconde "Mover para baixo" (item já está na última posição). */
  onMoveNext?: () => void;
  movePrevLabel?: string;
  moveNextLabel?: string;
  /** Ícones dos itens de mover (setas na direção do rótulo; padrão ↑/↓). */
  movePrevIcon?: LucideIcon;
  moveNextIcon?: LucideIcon;
  /** Omitir esconde "Delete" (item não removível, ex.: o corpo da página). */
  onDelete?: () => void;
  align?: 'start' | 'center' | 'end';
  /** Estilos de posição/revelação por contexto (ex.: opacity-0 group-hover…). */
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          className={cn(
            'text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 shrink-0 items-center justify-center rounded-editorial-sm transition-colors data-[state=open]:opacity-100',
            triggerClassName,
          )}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        {extraItems}
        {onMovePrev && (
          <DropdownMenuItem onSelect={onMovePrev}>
            <MovePrevIcon />
            {movePrevLabel}
          </DropdownMenuItem>
        )}
        {onMoveNext && (
          <DropdownMenuItem onSelect={onMoveNext}>
            <MoveNextIcon />
            {moveNextLabel}
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
