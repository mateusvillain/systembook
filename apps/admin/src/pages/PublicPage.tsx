import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc.js';
import { PageRenderer, type RenderableSnapshot } from '../features/public/PageRenderer.js';

/**
 * Superfície pública de documentação de uma página (TASK-50). Renderiza o
 * conteúdo da **última revisão publicada** (não o rascunho ao vivo), sem
 * autenticação. Rota provisória `/p/:pageId` — a hierarquia por slug
 * (`/:section/:page`) e o chrome de layout vêm com a TASK-52 (Fase 6).
 */
export function PublicPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const trpc = useTRPC();

  const query = useQuery({
    ...trpc.revisions.getLatestPublished.queryOptions({ pageId: pageId ?? '' }),
    enabled: !!pageId,
  });

  const container = (children: React.ReactNode) => (
    <main
      data-testid="public-page"
      style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem' }}
    >
      {children}
    </main>
  );

  if (query.isLoading) return container(<p>Carregando…</p>);
  if (query.isError) return container(<p role="alert">Erro ao carregar a página.</p>);

  if (!query.data) {
    return container(
      <div data-testid="not-published" style={{ color: '#666' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Esta página ainda não foi publicada</h1>
        <p>Assim que for publicada no painel, o conteúdo aparecerá aqui.</p>
      </div>,
    );
  }

  return container(<PageRenderer snapshot={query.data as RenderableSnapshot} />);
}
