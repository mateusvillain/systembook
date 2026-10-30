import { Link, useOutletContext } from 'react-router-dom';
import type { PublicOutletContext } from './PublicLayout.js';
import { PageRenderer } from './PageRenderer.js';
import { useLanding } from '../content/docsQueries.js';
import { useDocsPaths } from './docsRoutes.js';
import { useMessages } from '../i18n/UiLocale.js';

/**
 * Raiz da doc pública (`/docs` no modo CMS, TASK-56). Mostra a **página inicial
 * customizável** (última revisão publicada da landing, via `DocsDataSource.getLanding`)
 * renderizada pelo `PageRenderer` comum. Se a landing nunca foi publicada,
 * mostra um estado padrão de boas-vindas com um caminho para dentro da
 * documentação — nunca uma tela em branco (não redireciona mais direto para a
 * primeira seção, decisão da TASK-56).
 */
export function PublicHome() {
  const paths = useDocsPaths();
  const { tree, isLoading } = useOutletContext<PublicOutletContext>();
  const landing = useLanding();
  const t = useMessages();

  if (isLoading || landing.isPending) return <p>{t('state.loading')}</p>;

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
  // O link da 1ª página entra no lugar de `{page}` (o tradutor devolve texto).
  const [startBefore, startAfter = ''] = t('home.startAt').split('{page}');

  return (
    <div data-testid="landing-default">
      <h1 className="sb-public-title">{t('home.title')}</h1>
      {firstMenu && firstSection && firstPage ? (
        <p>
          {startBefore}
          <Link
            to={paths.page({
              menuSlug: firstMenu.slug,
              sectionSlug: firstSection.slug,
              pageSlug: firstPage.slug,
            })}
          >
            {firstPage.titulo}
          </Link>
          {startAfter}
        </p>
      ) : (
        <p className="sb-public-empty">{t('home.empty')}</p>
      )}
      <p className="sb-public-empty">{t('home.customize')}</p>
    </div>
  );
}
