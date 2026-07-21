import { Link, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';
import type { PublicOutletContext } from './PublicLayout.js';
import { PageRenderer, type RenderableSnapshot } from './PageRenderer.js';

/**
 * Raiz da doc pública (`/docs`, TASK-56). Mostra a **página inicial
 * customizável** (última revisão publicada da landing, via `landing.get`)
 * renderizada pelo `PageRenderer` comum. Se a landing nunca foi publicada,
 * mostra um estado padrão de boas-vindas com um caminho para dentro da
 * documentação — nunca uma tela em branco (não redireciona mais direto para a
 * primeira seção, decisão da TASK-56).
 */
export function PublicHome() {
  const { tree, isLoading } = useOutletContext<PublicOutletContext>();
  const trpc = useTRPC();
  const landing = useQuery(trpc.landing.get.queryOptions());

  if (isLoading || landing.isPending) return <p>Carregando…</p>;

  const snapshot = landing.data?.snapshot;
  const hasContent = snapshot && snapshot.tabs.some((t) => t.blocks.length > 0);

  if (hasContent) {
    return (
      <div data-testid="landing-published">
        <PageRenderer snapshot={snapshot as RenderableSnapshot} />
      </div>
    );
  }

  // Estado padrão: landing não publicada. Oferece um caminho para dentro da doc.
  const firstSection = tree[0];
  const firstPage = firstSection?.pages[0];

  return (
    <div data-testid="landing-default">
      <h1 className="sb-public-title">Documentação</h1>
      {firstSection && firstPage ? (
        <p>
          Bem-vindo à documentação. Comece por{' '}
          <Link to={`/docs/${firstSection.slug}/${firstPage.slug}`}>{firstPage.titulo}</Link>.
        </p>
      ) : (
        <p className="sb-public-empty">
          Nenhuma página foi publicada ainda. Publique uma página no painel para
          que ela apareça aqui.
        </p>
      )}
      <p className="sb-public-empty">
        Administradores podem personalizar esta página inicial em Painel → Página
        inicial.
      </p>
    </div>
  );
}
