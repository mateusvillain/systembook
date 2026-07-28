import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Menu, Moon, Sun } from 'lucide-react';
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

  // Fecha o drawer mobile com ESC (clique fora e item de navegação já fecham
  // via onClick/onNavigate abaixo).
  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setNavOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  const context: PublicOutletContext = { tree, isLoading: navQuery.isLoading };

  return (
    // `dark` (classe do shadcn, independente do `--sb-*` de `.sb-public`): sem
    // ela, componentes shadcn embutidos no conteúdo (Input/Switch do
    // ControlsPanel de Component Embed) ficam sempre claros — o `data-theme`
    // daqui não é o mecanismo que o shadcn entende.
    <div className={`sb-public${theme === 'dark' ? ' dark' : ''}`} data-theme={theme}>
      <header className="sb-public-header">
        <button
          type="button"
          className="sb-nav-toggle"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((o) => !o)}
          data-testid="nav-toggle"
        >
          <Menu aria-hidden size={18} />
        </button>
        <BookOpen aria-hidden size={18} />
        <span className="sb-public-brand">Documentation</span>
        <SearchBox />
        <button
          type="button"
          className="sb-theme-toggle"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          data-testid="theme-toggle"
        >
          {theme === 'dark' ? <Sun aria-hidden size={16} /> : <Moon aria-hidden size={16} />}
        </button>
      </header>
      <div className="sb-public-body">
        <div
          className="sb-public-backdrop"
          data-open={navOpen || undefined}
          onClick={() => setNavOpen(false)}
          data-testid="nav-backdrop"
        />
        <PublicSidebar tree={tree} open={navOpen} onNavigate={() => setNavOpen(false)} />
        <main className="sb-public-content">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}
