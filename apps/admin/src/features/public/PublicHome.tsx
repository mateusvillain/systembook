import { Link, useOutletContext } from 'react-router-dom';
import type { PublicOutletContext } from './PublicLayout.js';
import { PageRenderer } from './PageRenderer.js';
import { useLanding } from './docsQueries.js';

/**
 * Raiz da doc pública (`/docs`, TASK-56). Mostra a **página inicial
 * customizável** (última revisão publicada da landing, via `DocsDataSource.getLanding`)
 * renderizada pelo `PageRenderer` comum. Se a landing nunca foi publicada,
 * mostra um estado padrão de boas-vindas com um caminho para dentro da
 * documentação — nunca uma tela em branco (não redireciona mais direto para a
 * primeira seção, decisão da TASK-56).
 */
export function PublicHome() {
  const { tree, isLoading } = useOutletContext<PublicOutletContext>();
  const landing = useLanding();

  if (isLoading || landing.isPending) return <p>Loading…</p>;

  const snapshot = landing.data;
  const hasContent = snapshot && snapshot.tabs.some((t) => t.blocks.length > 0);

  if (hasContent) {
    return (
      <div data-testid="landing-published">
        <PageRenderer snapshot={snapshot} />
      </div>
    );
  }

  // Estado padrão: landing não publicada. Oferece um caminho para dentro da doc
  // — a 1ª página da 1ª seção do 1º menu (a árvore já vem ordenada e sem
  // menus/seções vazios, SYS-37).
  const firstMenu = tree[0];
  const firstSection = firstMenu?.sections[0];
  const firstPage = firstSection?.pages[0];

  return (
    <div data-testid="landing-default">
      <h1 className="sb-public-title">Documentation</h1>
      {firstMenu && firstSection && firstPage ? (
        <p>
          Bem-vindo à documentação. Comece por{' '}
          <Link to={`/docs/${firstMenu.slug}/${firstSection.slug}/${firstPage.slug}`}>
            {firstPage.titulo}
          </Link>
          .
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
