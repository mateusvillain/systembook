import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';
import { PublicSidebar, type PublicNavTree } from './PublicSidebar.js';
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

  const context: PublicOutletContext = { tree, isLoading: navQuery.isLoading };

  return (
    <div className="sb-public">
      <header className="sb-public-header">
        <span aria-hidden>📘</span>
        <span>Documentação</span>
      </header>
      <div className="sb-public-body">
        <PublicSidebar tree={tree} />
        <main className="sb-public-content">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}
