import { Navigate, useOutletContext } from 'react-router-dom';
import type { PublicOutletContext } from './PublicLayout.js';

/**
 * Home da doc (`/docs`): redireciona para a primeira página publicada. Se ainda
 * não há nada publicado, mostra um estado vazio claro (TASK-52).
 */
export function PublicHome() {
  const { tree, isLoading } = useOutletContext<PublicOutletContext>();

  if (isLoading) return <p>Carregando…</p>;

  const firstSection = tree[0];
  const firstPage = firstSection?.pages[0];
  if (firstSection && firstPage) {
    return <Navigate to={`/docs/${firstSection.slug}/${firstPage.slug}`} replace />;
  }

  return (
    <div data-testid="public-empty">
      <h1 className="sb-public-title">Documentação</h1>
      <p style={{ color: '#666' }}>
        Nenhuma página foi publicada ainda. Publique uma página no painel para
        que ela apareça aqui.
      </p>
    </div>
  );
}
