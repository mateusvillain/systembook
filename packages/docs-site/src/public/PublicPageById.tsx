import { useParams } from 'react-router-dom';
import { PageRenderer } from './PageRenderer.js';
import { usePageById } from '../content/docsQueries.js';
import { useMessages } from '../i18n/UiLocale.js';

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
  const t = useMessages();

  const container = (children: React.ReactNode) => (
    <main
      data-testid="public-page"
      style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem' }}
    >
      {children}
    </main>
  );

  if (query.isLoading) return container(<p>{t('state.loading')}</p>);
  if (query.isError) return container(<p role="alert">{t('state.pageLoadFailed')}</p>);

  if (!query.data) {
    return container(
      <div data-testid="not-published" style={{ color: '#666' }}>
        <h1 style={{ fontSize: '1.25rem' }}>{t('page.notPublishedTitle')}</h1>
        <p>{t('page.notPublishedHint')}</p>
      </div>,
    );
  }

  return container(<PageRenderer snapshot={query.data} />);
}
