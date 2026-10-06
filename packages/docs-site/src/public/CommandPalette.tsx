import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, CornerDownLeft, Search, X } from 'lucide-react';
import { usePublicSearch, usePublicSettings } from '../content/docsQueries.js';
import { useDocsPaths } from './docsRoutes.js';

// Delimitadores STX/ETX que o `snippet()` do FTS5 coloca ao redor dos termos
// casados (ver SearchResult.snippet no server). Escritos como escapes \u para
// não dependerem de caracteres de controle literais no fonte (que podem ser
// perdidos ao salvar → regex zero-width → loop infinito). Renderizamos os
// trechos casados como <mark>; o texto entre eles é conteúdo (untrusted) que o
// React escapa automaticamente — sem dangerouslySetInnerHTML, sem injeção.
const MATCH_OPEN = String.fromCharCode(2); // STX
const MATCH_CLOSE = String.fromCharCode(3); // ETX

function highlight(snippet: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = new RegExp(`${MATCH_OPEN}([^${MATCH_CLOSE}]*)${MATCH_CLOSE}`, 'g');
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(snippet)) !== null) {
    // Defesa contra loop infinito caso a regex algum dia case vazio.
    if (regex.lastIndex === match.index) {
      regex.lastIndex++;
      continue;
    }
    if (match.index > last) parts.push(snippet.slice(last, match.index));
    parts.push(<mark key={key++}>{match[1]}</mark>);
    last = regex.lastIndex;
  }
  if (last < snippet.length) parts.push(snippet.slice(last));
  return parts;
}

const DEBOUNCE_MS = 200;

/** Um resultado da busca na palette. */
interface Entry {
  id: string;
  to: string;
  title: string;
  group: string;
  description: ReactNode | null;
}

/** Entradas na ordem de exibição, agrupadas pela primeira aparição do grupo. */
function groupEntries(entries: Entry[]): { label: string; items: { entry: Entry; index: number }[] }[] {
  const groups: { label: string; items: { entry: Entry; index: number }[] }[] = [];
  entries.forEach((entry, index) => {
    let group = groups.find((g) => g.label === entry.group);
    if (!group) {
      group = { label: entry.group, items: [] };
      groups.push(group);
    }
    group.items.push({ entry, index });
  });
  return groups;
}

/**
 * Busca da doc pública como Command Palette (SYS-116): um modal sobre a página,
 * aberto pelo gatilho do header ou por ⌘K / Ctrl+K. Sem texto, só o campo;
 * digitando, mostra os resultados da busca (debounced) agrupados por seção.
 * ↑/↓ navegam, Enter abre (⌘/Ctrl+Enter em outra aba), Esc fecha.
 *
 * É um `<dialog>` nativo aberto com `showModal()`: o navegador entrega a camada
 * superior, o foco preso, o Esc e a devolução do foco ao gatilho. Fica no DOM do
 * `.sb-public`, então herda os tokens `--sb-*` e o tema sem portal.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Desmontar com o modal aberto (troca de rota do shell) não pode deixar a
  // camada superior presa.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sb-palette"
      aria-label="Search"
      // Esc e `close()` disparam `close`; é o único caminho que devolve o estado
      // ao pai, então o `open` nunca diverge do que o navegador mostra. O evento é
      // despachado numa tarefa à parte: se o modal foi reaberto nesse intervalo
      // (⌘K duas vezes seguidas), o `close` velho não pode derrubar o novo.
      onClose={() => {
        if (!dialogRef.current?.open) onClose();
      }}
      // O backdrop é parte do próprio `<dialog>`: um clique nele tem o dialog
      // como alvo, ao contrário dos cliques no painel.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && <PaletteBody onClose={onClose} />}
    </dialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const paths = useDocsPaths();
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  // O item ativo só rola para a vista quando a mudança veio do teclado: com o
  // mouse, rolar sob o cursor faz a lista "fugir" de quem passa o ponteiro.
  const scrollActive = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const settings = usePublicSettings();
  const searchQuery = usePublicSearch(debounced);

  const name = settings.data?.nomeDesignSystem;
  const placeholder = name ? `Search ${name}` : 'Search the documentation';

  const searching = query.trim().length > 0;
  const entries = useMemo<Entry[]>(() => {
    if (!searching) return [];
    return (searchQuery.data ?? []).map((r) => ({
      id: r.pageId,
      to: r.menuSlug
        ? paths.page({ menuSlug: r.menuSlug, sectionSlug: r.sectionSlug ?? '', pageSlug: r.pageSlug })
        : paths.legacyPage(r.sectionSlug ?? '', r.pageSlug),
      title: r.pageTitulo,
      group: r.sectionTitulo,
      description: r.snippet ? highlight(r.snippet) : null,
    }));
  }, [searching, searchQuery.data, paths]);
  const groups = useMemo(() => groupEntries(entries), [entries]);

  // O primeiro item vem selecionado, e a seleção volta a ele quando a lista muda.
  useEffect(() => setActive(0), [entries]);

  // Mantém o item ativo à vista ao navegar por teclado (a lista rola, o foco não).
  useEffect(() => {
    if (!scrollActive.current) return;
    scrollActive.current = false;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const waiting = searching && (debounced !== query.trim() || searchQuery.isFetching) && entries.length === 0;
  const empty = searching && !waiting && entries.length === 0;
  // O listbox só existe com resultados: `aria-controls`/`aria-expanded` não
  // podem apontar para um id que não está no DOM.
  const listOpen = entries.length > 0;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (entries.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      scrollActive.current = true;
      setActive((i) => (i + 1) % entries.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      scrollActive.current = true;
      setActive((i) => (i <= 0 ? entries.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      // Enter que confirma uma composição de IME (japonês, chinês…) não é "abrir".
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      // A lista ainda é a da busca anterior (o debounce não rodou): abrir o item
      // dela levaria a uma página que não é a do texto digitado.
      if (debounced !== query.trim()) return;
      const chosen = entries[active];
      if (!chosen) return;
      if (e.metaKey || e.ctrlKey) {
        // O `href` do link já carrega a base do router (prefixo de publicação).
        const href = document.getElementById(optionId(active))?.getAttribute('href');
        if (href) window.open(href, '_blank', 'noopener');
        return;
      }
      onClose();
      navigate(chosen.to);
    }
  }

  return (
    <div className="sb-palette-panel">
      <div className="sb-palette-header">
        <Search className="sb-palette-search-icon" aria-hidden size={20} />
        <input
          type="search"
          className="sb-palette-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listOpen ? optionId(active) : undefined}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          data-testid="public-search-input"
        />
        <button type="button" className="sb-palette-close" aria-label="Close search" onClick={onClose} data-testid="search-close">
          <X aria-hidden size={20} />
        </button>
      </div>

      {/* Sem texto não há corpo: a palette é só o campo e o rodapé até digitar. */}
      {searching && (
        <div className="sb-palette-body">
          {waiting ? (
            <p className="sb-palette-hint">Searching…</p>
          ) : empty ? (
            <p className="sb-palette-hint" data-testid="search-no-results">
              No results found.
            </p>
          ) : (
            <div id={listboxId} role="listbox" aria-label="Results" data-testid="search-results">
              {groups.map((group) => (
                <div key={group.label} role="group" aria-label={group.label} className="sb-palette-group">
                  <p className="sb-palette-group-label" aria-hidden>
                    {group.label}
                  </p>
                  <ul className="sb-palette-items" role="presentation">
                    {group.items.map(({ entry, index }) => (
                      <li key={entry.id} role="presentation">
                        <Link
                          to={entry.to}
                          id={optionId(index)}
                          role="option"
                          aria-selected={index === active}
                          className={`sb-palette-item${index === active ? ' active' : ''}`}
                          onClick={(e) => {
                            // Cliques com modificador abrem em outra aba e deixam a palette no lugar.
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            onClose();
                          }}
                          onMouseMove={() => setActive(index)}
                          data-testid="search-result"
                        >
                          <span className="sb-palette-item-title">{entry.title}</span>
                          {entry.description && <span className="sb-palette-item-desc">{entry.description}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Anúncio para leitores de tela: a lista muda sem mover o foco. Fica fora do
          `searching &&` — uma região viva montada junto com o primeiro texto costuma
          não ser anunciada. */}
      <p className="sb-palette-sr" role="status" aria-live="polite">
        {!searching || waiting
          ? ''
          : empty
            ? 'No results found.'
            : `${entries.length} ${entries.length === 1 ? 'result' : 'results'}`}
      </p>

      <div className="sb-palette-footer" aria-hidden>
        <span className="sb-palette-hintkey">
          <kbd>
            <ArrowUp size={14} />
            <ArrowDown size={14} />
          </kbd>
          Navigate
        </span>
        <span className="sb-palette-hintkey">
          <kbd>
            <CornerDownLeft size={14} />
          </kbd>
          Select
        </span>
        <span className="sb-palette-hintkey">
          <kbd>Esc</kbd>
          Close
        </span>
      </div>
    </div>
  );
}
