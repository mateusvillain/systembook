import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';

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

const DEBOUNCE_MS = 300;

/**
 * Busca da doc pública (TASK-54): input no header com resultados ao vivo num
 * dropdown, debounced (300ms) para não disparar `search.query` a cada tecla.
 * Cada resultado mostra título, breadcrumb da seção e o snippet destacado, e
 * navega para a página ao ser selecionado (mouse ou ↑/↓+Enter). Escopo MVP:
 * dropdown leve in-page, sem página de resultados dedicada (nota do spec).
 */
export function SearchBox() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const listboxId = useId();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // índice destacado por teclado
  const [mobileOpen, setMobileOpen] = useState(false); // overlay full-screen no mobile
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce: só atualiza o termo buscado após o usuário parar de digitar.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const searchQuery = useQuery({
    ...trpc.search.query.queryOptions({ q: debounced }),
    enabled: debounced.length > 0,
  });
  const results = searchQuery.data ?? [];

  // Reseta o item ativo quando os resultados mudam.
  useEffect(() => setActive(-1), [debounced]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function goTo(r: (typeof results)[number]) {
    setOpen(false);
    setMobileOpen(false);
    setQuery('');
    navigate(`/docs/${r.sectionSlug ?? ''}/${r.pageSlug}`);
  }

  function openMobile() {
    setMobileOpen(true);
    setOpen(true);
    // Foca o input após o overlay aparecer.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeMobile() {
    setMobileOpen(false);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setMobileOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      const chosen = results[active];
      if (chosen) goTo(chosen);
    }
  }

  const showDropdown = open && debounced.length > 0;
  const showNoResults = showDropdown && !searchQuery.isLoading && results.length === 0;

  return (
    <>
      {/* Gatilho só-mobile: abre o overlay de busca full-screen (CSS controla a
          visibilidade por breakpoint). */}
      <button
        type="button"
        className="sb-search-trigger"
        aria-label="Buscar na documentação"
        onClick={openMobile}
        data-testid="search-trigger"
      >
        <span aria-hidden>🔍</span>
      </button>

      <div
        className="sb-searchbox"
        ref={containerRef}
        role="search"
        data-mobile-open={mobileOpen || undefined}
        data-testid="searchbox"
      >
        <div className="sb-searchbox-field">
          <input
            ref={inputRef}
            type="search"
            className="sb-searchbox-input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Buscar na documentação…"
            aria-label="Buscar na documentação"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-autocomplete="list"
            data-testid="public-search-input"
          />
          {/* Botão fechar só aparece no overlay mobile (CSS). */}
          <button
            type="button"
            className="sb-search-close"
            aria-label="Fechar busca"
            onClick={closeMobile}
            data-testid="search-close"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        {showDropdown && (
        <div className="sb-searchbox-dropdown" id={listboxId} role="listbox" data-testid="search-dropdown">
          {searchQuery.isLoading ? (
            <p className="sb-searchbox-hint">Buscando…</p>
          ) : showNoResults ? (
            <p className="sb-searchbox-hint" data-testid="search-no-results">
              Nenhum resultado encontrado.
            </p>
          ) : (
            <ul className="sb-searchbox-results" data-testid="search-results">
              {results.map((r, i) => (
                <li key={r.pageId} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    className={`sb-searchbox-result${i === active ? ' active' : ''}`}
                    // onMouseDown (não onClick) para navegar antes do blur do
                    // input fechar o dropdown.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      goTo(r);
                    }}
                    onMouseEnter={() => setActive(i)}
                    data-testid="search-result"
                  >
                    <span className="sb-searchbox-result-section">{r.sectionTitulo}</span>
                    <span className="sb-searchbox-result-title">{r.pageTitulo}</span>
                    {r.snippet && (
                      <span className="sb-searchbox-result-snippet">{highlight(r.snippet)}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}
      </div>
    </>
  );
}
