import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { cn } from '@/lib/utils';
import type { BlockItem } from './blockInsert.js';

/** Um item do registro com o rótulo do grupo a que pertence — achatado pra
 * indexação simples de teclado, mas ainda exibido com cabeçalhos de seção. */
export interface SlashMenuEntry {
  groupLabel: string;
  item: BlockItem;
}

export interface SlashMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/**
 * Popup do menu "/" (TASK-103): renderizado via `ReactRenderer` dentro do
 * `SlashCommand.ts` (extensão `Suggestion`). Navegação por teclado é exposta
 * via ref (`onKeyDown`) porque o plugin da `Suggestion` intercepta o keydown
 * do editor e repassa pra cá — o componente não escuta eventos diretamente.
 */
export const SlashMenu = forwardRef<SlashMenuHandle, SuggestionProps<SlashMenuEntry, SlashMenuEntry>>(
  function SlashMenu({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => {
      setSelected(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === 'ArrowDown') {
          setSelected((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowUp') {
          setSelected((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const entry = items[selected];
          if (entry) command(entry);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="sb-slash-menu w-64 rounded-editorial-md border border-border/80 bg-background p-3 text-sm text-muted-foreground shadow-editorial-md">
          No matching blocks
        </div>
      );
    }

    let flatIndex = -1;
    let lastGroupLabel: string | null = null;

    return (
      <div
        role="listbox"
        aria-label="Insert block"
        className="sb-slash-menu w-64 rounded-editorial-md border border-border/80 bg-background p-1.5 shadow-editorial-md"
      >
        {items.map((entry) => {
          flatIndex += 1;
          const index = flatIndex;
          const showGroupLabel = entry.groupLabel !== lastGroupLabel;
          lastGroupLabel = entry.groupLabel;
          const active = index === selected;

          return (
            <div key={entry.item.id}>
              {showGroupLabel && (
                <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                  {entry.groupLabel}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setSelected(index)}
                onClick={() => command(entry)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-editorial-sm px-2.5 py-1.5 text-left text-sm font-medium transition-colors',
                  active ? 'bg-accent text-foreground' : 'text-foreground/90 hover:bg-accent hover:text-foreground',
                )}
              >
                <entry.item.icon className="size-4 shrink-0 text-muted-foreground" />
                <span>{entry.item.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  },
);
