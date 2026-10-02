import { useParams } from 'react-router-dom';
import { PageRenderer } from './PageRenderer.js';
import { usePageById } from '../content/docsQueries.js';

/**
 * Superfície pública de documentação de uma página (TASK-50). Renderiza o
 * conteúdo da **última revisão publicada** (não o rascunho ao vivo), sem
 * autenticação, sem o shell da doc. Atende o link direto por id
 * (`/p/:pageId`), mantido para bookmarks e preview sem slug; a navegação
 * pública canônica é por slug (`PublicPageView`, TASK-52).
 */
export function PublicPageById() {
  const { pageId } = useParams<{ pageId: string }>();
  const query = usePageById(pageId);

  const container = (children: React.ReactNode) => (
    <main
      data-testid="public-page"
      style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem' }}
    >
      {children}
    </main>
  );

  if (query.isLoading) return container(<p>Loading…</p>);
  if (query.isError) return container(<p role="alert">Failed to load the page.</p>);

  if (!query.data) {
    return container(
      <div data-testid="not-published" style={{ color: '#666' }}>
        <h1 style={{ fontSize: '1.25rem' }}>This page has not been published yet</h1>
        <p>Once it is published in the panel, the content will appear here.</p>
      </div>,
    );
  }

  return container(<PageRenderer snapshot={query.data} />);
}
