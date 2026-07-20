import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';
import { PageRenderer, type RenderableSnapshot } from './PageRenderer.js';

/**
 * Conteúdo de uma página na doc pública (TASK-52): resolve
 * `sectionSlug`/`pageSlug` para a última revisão publicada e renderiza via
 * `PageRenderer`. A tab ativa vem da URL (`/:tabId?`) e trocar de tab atualiza
 * a URL (client-side, sem reload), tornando o link direto/bookmarkável.
 */
export function PublicPageView() {
  const { sectionSlug, pageSlug, tabId } = useParams<{
    sectionSlug: string;
    pageSlug: string;
    tabId?: string;
  }>();
  const navigate = useNavigate();
  const trpc = useTRPC();

  const query = useQuery({
    ...trpc.pages.getPublishedBySlug.queryOptions({
      sectionSlug: sectionSlug ?? '',
      pageSlug: pageSlug ?? '',
    }),
    enabled: !!sectionSlug && !!pageSlug,
  });

  if (query.isLoading) return <p>Carregando…</p>;
  if (query.isError) return <p role="alert">Erro ao carregar a página.</p>;

  // Seção/página inexistente → 404.
  if (!query.data) {
    return (
      <div data-testid="public-not-found">
        <h1 className="sb-public-title">Página não encontrada</h1>
        <p style={{ color: '#666' }}>Esta página não existe ou o endereço mudou.</p>
      </div>
    );
  }

  const { titulo, snapshot } = query.data;

  return (
    <article>
      <h1 className="sb-public-title">{titulo}</h1>
      {snapshot ? (
        <PageRenderer
          snapshot={snapshot as RenderableSnapshot}
          activeTabId={tabId ?? snapshot.tabs[0]?.tabId ?? ''}
          onSelectTab={(nextTabId) =>
            navigate(`/docs/${sectionSlug}/${pageSlug}/${nextTabId}`)
          }
        />
      ) : (
        <div data-testid="not-published" style={{ color: '#666' }}>
          <p>Esta página ainda não foi publicada.</p>
        </div>
      )}
    </article>
  );
}
