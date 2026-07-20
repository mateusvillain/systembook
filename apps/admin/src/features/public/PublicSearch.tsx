import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';

// Delimitadores STX/ETX que o `snippet()` do FTS5 coloca ao redor dos termos
// casados (ver SearchResult.snippet no server). Renderizamos os trechos casados
// como <mark>; o texto entre eles é conteúdo (untrusted) que o React escapa
// automaticamente — sem dangerouslySetInnerHTML, sem risco de injeção.
const MATCH_OPEN = '';
const MATCH_CLOSE = '';

function highlight(snippet: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = new RegExp(`${MATCH_OPEN}([^${MATCH_CLOSE}]*)${MATCH_CLOSE}`, 'g');
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(snippet)) !== null) {
    if (match.index > last) parts.push(snippet.slice(last, match.index));
    parts.push(<mark key={key++}>{match[1]}</mark>);
    last = regex.lastIndex;
  }
  if (last < snippet.length) parts.push(snippet.slice(last));
  return parts;
}

/**
 * Página de resultados da busca full-text (TASK-53), rota `/docs/search?q=…`.
 * Consome `search.query` (publicProcedure, FTS5) e lista páginas publicadas
 * rankeadas, com o trecho destacado. Cada resultado linka para a doc pública.
 */
export function PublicSearch() {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const trpc = useTRPC();

  const searchQuery = useQuery({
    ...trpc.search.query.queryOptions({ q }),
    enabled: q.length > 0,
  });
  const results = searchQuery.data ?? [];

  return (
    <div className="sb-public-search" data-testid="public-search">
      <h1 className="sb-public-title">Busca</h1>

      {q.length === 0 ? (
        <p className="sb-public-empty">Digite um termo para buscar na documentação.</p>
      ) : searchQuery.isLoading ? (
        <p className="sb-public-empty">Buscando…</p>
      ) : results.length === 0 ? (
        <p className="sb-public-empty" data-testid="search-no-results">
          Nenhum resultado para <strong>{q}</strong>.
        </p>
      ) : (
        <ul className="sb-search-results" data-testid="search-results">
          {results.map((r) => (
            <li key={r.pageId} className="sb-search-result">
              <Link
                to={`/docs/${r.sectionSlug ?? ''}/${r.pageSlug}`}
                className="sb-search-result-link"
              >
                <span className="sb-search-result-section">{r.sectionTitulo}</span>
                <span className="sb-search-result-title">{r.pageTitulo}</span>
              </Link>
              {r.snippet && <p className="sb-search-result-snippet">{highlight(r.snippet)}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
