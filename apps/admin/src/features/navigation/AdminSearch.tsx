import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CornerDownLeft,
  File,
  FileText,
  Folder,
  LayoutGrid,
  Search,
  Text,
  type LucideIcon,
} from 'lucide-react';
import { useTRPC } from '../../lib/trpc.js';
import { EmptyState } from '@/components/EmptyState';
import { adminTypography } from '@/lib/typography';
import { cn } from '@/lib/utils';

// STX/ETX delimitam os trechos casados no snippet do FTS5 (mesma convenção do
// SearchBox público). Escritos como escapes \u para sobreviver a saves. O texto
// entre eles é conteúdo untrusted — o React o escapa; só envolvemos os trechos
// casados em <mark>, sem dangerouslySetInnerHTML.
const MATCH_OPEN = String.fromCharCode(2);
const MATCH_CLOSE = String.fromCharCode(3);

function highlight(snippet: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = new RegExp(`${MATCH_OPEN}([^${MATCH_CLOSE}]*)${MATCH_CLOSE}`, 'g');
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(snippet)) !== null) {
    if (regex.lastIndex === match.index) {
      regex.lastIndex++;
      continue;
    }
    if (match.index > last) parts.push(snippet.slice(last, match.index));
    parts.push(
      <mark key={key++} className="bg-transparent font-semibold text-foreground">
        {match[1]}
      </mark>,
    );
    last = regex.lastIndex;
  }
  if (last < snippet.length) parts.push(snippet.slice(last));
  return parts;
}

const DEBOUNCE_MS = 300;

type StructureResult = {
  type: 'menu' | 'section' | 'page' | 'tab';
  id: string;
  titulo: string;
  menuId: string;
  pageId?: string;
  tabId?: string;
  context?: string;
};
type ContentResult = {
  pageId: string;
  pageTitulo: string;
  pageSlug: string;
  sectionTitulo: string;
  sectionSlug: string | null;
  snippet: string;
};

type FlatItem = { kind: 'structure'; data: StructureResult } | { kind: 'content'; data: ContentResult };

const STRUCTURE_ICON: Record<StructureResult['type'], LucideIcon> = {
  menu: LayoutGrid,
  section: Folder,
  page: FileText,
  tab: File,
};

const STRUCTURE_KIND_LABEL: Record<StructureResult['type'], string> = {
  menu: 'Menu',
  section: 'Seção',
  page: 'Página',
  tab: 'Aba',
};

/**
 * Busca global do painel (TASK-91). Paleta de comandos aberta pelo gatilho no
 * header (ou ⌘K/Ctrl+K): casa a **estrutura de navegação** (menus/seções/
 * páginas/tabs, incluindo rascunhos — `search.structure`, protegida) e o
 * **conteúdo publicado** (`search.query`, o mesmo índice FTS5 da doc pública).
 *
 * Reusa o modelo de interação do `SearchBox` público — debounce 300ms, ↑/↓ para
 * navegar entre TODOS os resultados (cruzando os dois grupos), Enter para abrir,
 * Escape para fechar — mas renderiza com os tokens do admin, num diálogo modal.
 * Ao selecionar, ativa o menu dono (TASK-85/86) e navega para o editor do item.
 */
export function AdminSearch({ onSelectMenu }: { onSelectMenu: (menuId: string) => void }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const listboxId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K abre a paleta de qualquer lugar do painel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Debounce: só busca depois que o usuário para de digitar.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const enabled = open && debounced.length > 0;
  const structureQuery = useQuery({
    ...trpc.search.structure.queryOptions({ q: debounced }),
    enabled,
  });
  const contentQuery = useQuery({
    ...trpc.search.query.queryOptions({ q: debounced }),
    enabled,
  });

  const structure = (structureQuery.data ?? []) as StructureResult[];
  const content = (contentQuery.data ?? []) as ContentResult[];

  // Lista achatada na ordem de render (estrutura → conteúdo) para a navegação
  // por teclado percorrer os dois grupos como uma coisa só.
  const items = useMemo<FlatItem[]>(
    () => [
      ...structure.map((data) => ({ kind: 'structure', data }) as const),
      ...content.map((data) => ({ kind: 'content', data }) as const),
    ],
    [structure, content],
  );

  // Reseta o item ativo quando a consulta muda.
  useEffect(() => setActive(-1), [debounced]);

  // Mantém o item ativo visível ao navegar por teclado.
  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    listRef.current
      .querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function close() {
    setOpen(false);
    setQuery('');
    setDebounced('');
    setActive(-1);
  }

  function select(item: FlatItem) {
    if (item.kind === 'structure') {
      const r = item.data;
      onSelectMenu(r.menuId);
      if (r.type === 'tab' && r.pageId && r.tabId) navigate(`/pages/${r.pageId}/tabs/${r.tabId}`);
      else if (r.type === 'page' && r.pageId) navigate(`/pages/${r.pageId}`);
      else navigate('/'); // menu/seção: sem rota própria → home do menu ativo
    } else {
      // Conteúdo: abre o editor da página (não a URL pública /docs/…). O
      // AdminLayout sincroniza o menu ativo dono da página ao navegar.
      navigate(`/pages/${item.data.pageId}`);
    }
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      const chosen = items[active];
      if (chosen) select(chosen);
    }
  }

  const isLoading = structureQuery.isLoading || contentQuery.isLoading;
  const showResults = debounced.length > 0;
  const noResults = showResults && !isLoading && items.length === 0;
  const structureCount = structure.length;

  return (
    <>
      {/* Gatilho no header — mostra o atalho ⌘K como affordance. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        aria-keyshortcuts="Meta+K Control+K"
        // Borderless (estilo Zeroheight): ícone + rótulo, feedback só no hover —
        // sem a caixa com `border` que fazia o gatilho parecer um chip (TASK-95).
        className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-11 items-center justify-center gap-2 rounded-editorial-sm text-sm transition-colors sm:h-8 sm:w-auto sm:justify-start sm:px-2.5"
        data-testid="admin-search-trigger"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="bg-muted text-muted-foreground ml-1 hidden rounded px-1.5 py-0.5 text-[0.6875rem] font-medium sm:inline-block">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Buscar no painel"
          data-testid="admin-search-dialog"
        >
          {/* Backdrop: fecha ao clicar fora. */}
          <div
            className="bg-foreground/30 absolute inset-0"
            aria-hidden
            onMouseDown={close}
          />

          <div className="bg-popover text-popover-foreground relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-editorial-md border shadow-lg">
            {/* Campo de busca */}
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <input
                ref={inputRef}
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar menus, páginas, conteúdo…"
                aria-label="Buscar no painel"
                role="combobox"
                aria-expanded={showResults}
                aria-controls={listboxId}
                aria-autocomplete="list"
                className="h-12 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                data-testid="admin-search-input"
              />
            </div>

            {/* Resultados */}
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-2" id={listboxId} role="listbox">
              {!showResults ? (
                <p className={cn(adminTypography.metadata, 'px-4 py-6 text-center')} data-testid="admin-search-hint">
                  Digite para buscar na estrutura e no conteúdo publicado.
                </p>
              ) : isLoading ? (
                <p className={cn(adminTypography.metadata, 'px-4 py-6 text-center')}>Buscando…</p>
              ) : noResults ? (
                <EmptyState
                  size="sm"
                  icon={Search}
                  title="Nenhum resultado"
                  description={`Nada corresponde a “${debounced}”. Tente outro termo.`}
                />
              ) : (
                <>
                  {structureCount > 0 && (
                    <Group label="Estrutura">
                      {structure.map((r, i) => (
                        <ResultRow
                          key={`s-${r.type}-${r.id}`}
                          index={i}
                          active={active === i}
                          icon={STRUCTURE_ICON[r.type]}
                          title={r.titulo}
                          meta={r.context}
                          badge={STRUCTURE_KIND_LABEL[r.type]}
                          onActivate={() => setActive(i)}
                          onSelect={() => select({ kind: 'structure', data: r })}
                        />
                      ))}
                    </Group>
                  )}
                  {content.length > 0 && (
                    <Group label="Conteúdo publicado">
                      {content.map((r, ci) => {
                        const i = structureCount + ci;
                        return (
                          <ResultRow
                            key={`c-${r.pageId}`}
                            index={i}
                            active={active === i}
                            icon={Text}
                            title={r.pageTitulo}
                            meta={r.sectionTitulo}
                            snippet={r.snippet ? highlight(r.snippet) : undefined}
                            onActivate={() => setActive(i)}
                            onSelect={() => select({ kind: 'content', data: r })}
                          />
                        );
                      })}
                    </Group>
                  )}
                </>
              )}
            </div>

            {/* Rodapé de dicas de teclado */}
            <div className="text-muted-foreground flex items-center gap-4 border-t px-4 py-2 text-[0.6875rem]">
              <span className="flex items-center gap-1">
                <kbd className="bg-muted rounded px-1 py-0.5">↑</kbd>
                <kbd className="bg-muted rounded px-1 py-0.5">↓</kbd>
                navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-muted inline-flex items-center rounded px-1 py-0.5">
                  <CornerDownLeft className="size-3" />
                </kbd>
                abrir
              </span>
              <span className="flex items-center gap-1">
                <kbd className="bg-muted rounded px-1 py-0.5">esc</kbd>
                fechar
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-2 pb-1">
      <p className={cn(adminTypography.category, 'px-2 pb-1 pt-2 text-[0.6875rem]')}>{label}</p>
      {children}
    </div>
  );
}

function ResultRow({
  index,
  active,
  icon: Icon,
  title,
  meta,
  badge,
  snippet,
  onActivate,
  onSelect,
}: {
  index: number;
  active: boolean;
  icon: LucideIcon;
  title: string;
  meta?: string;
  badge?: string;
  snippet?: ReactNode;
  onActivate: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-index={index}
      data-testid="admin-search-result"
      // onMouseDown (não onClick) para agir antes do blur do input.
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onActivate}
      className={cn(
        'flex w-full items-center gap-3 rounded-editorial-sm px-2 py-2 text-left transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/60',
      )}
    >
      <span className="text-muted-foreground bg-muted flex size-8 shrink-0 items-center justify-center rounded-editorial-sm">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-foreground truncate text-sm font-medium">{title}</span>
          {badge && (
            <span className="text-muted-foreground border-border shrink-0 rounded-full border px-1.5 py-px text-[0.625rem] uppercase tracking-wide">
              {badge}
            </span>
          )}
        </span>
        {snippet ? (
          <span className="text-muted-foreground mt-0.5 line-clamp-1 block text-xs">{snippet}</span>
        ) : (
          meta && <span className="text-muted-foreground mt-0.5 block truncate text-xs">{meta}</span>
        )}
      </span>
    </button>
  );
}
