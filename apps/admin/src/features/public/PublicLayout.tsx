import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';
import { PublicSidebar, type PublicNavTree } from './PublicSidebar.js';
import { SearchBox } from './SearchBox.js';
import { useTheme } from './useTheme.js';
import './public.css';

/** Passado aos filhos via Outlet context (evita re-buscar a árvore). */
export interface PublicOutletContext {
  tree: PublicNavTree;
  isLoading: boolean;
}

/**
 * Shell da documentação pública (TASK-52) — completamente separado do
 * `AdminLayout`: sem nav de admin, sem toolbar/edição, sem auth. Busca a árvore
 * de navegação (`sections.listPublic`) uma vez e a expõe à sidebar e às rotas
 * filhas.
 */
export function PublicLayout() {
  const trpc = useTRPC();
  const navQuery = useQuery(trpc.sections.listPublic.queryOptions());
  const tree = navQuery.data ?? [];
  const { theme, toggle } = useTheme();
  const [navOpen, setNavOpen] = useState(false);

  const context: PublicOutletContext = { tree, isLoading: navQuery.isLoading };

  return (
    <div className="sb-public" data-theme={theme}>
      <header className="sb-public-header">
        <button
          type="button"
          className="sb-nav-toggle"
          aria-label="Abrir navegação"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((o) => !o)}
          data-testid="nav-toggle"
        >
          <span aria-hidden>☰</span>
        </button>
        <span aria-hidden>📘</span>
        <span className="sb-public-brand">Documentação</span>
        <SearchBox />
        <button
          type="button"
          className="sb-theme-toggle"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          data-testid="theme-toggle"
        >
          <span aria-hidden>{theme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
      </header>
      <div className="sb-public-body">
        {navOpen && (
          <div
            className="sb-public-backdrop"
            onClick={() => setNavOpen(false)}
            data-testid="nav-backdrop"
          />
        )}
        <PublicSidebar tree={tree} open={navOpen} onNavigate={() => setNavOpen(false)} />
        <main className="sb-public-content">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}
