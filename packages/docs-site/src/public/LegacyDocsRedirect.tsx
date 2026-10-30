import { Navigate, useLocation } from 'react-router-dom';
import { DocsNotFound } from './DocsNotFound.js';
import { useResolvedPath } from '../content/docsQueries.js';
import { useDocsPaths } from './docsRoutes.js';
import { useMessages } from '../i18n/UiLocale.js';

/**
 * Compatibilidade das URLs da doc publicadas antes de o menu entrar no
 * path (SYS-37). Pega os segmentos crus da URL, pede a forma canônica à fonte
 * de dados (`DocsDataSource.resolvePath`, que desambigua `menu/section/page` de
 * `section/page/tab` por dado, não por heurística) e redireciona com
 * `replace` — o endereço antigo não fica no histórico.
 *
 * Serve dois casos: a rota de 2 segmentos, que só pode ser legada, e o
 * fallback do `PublicPageView` quando um path de 3 segmentos não resolve como
 * canônico. Quando nada resolve, é um 404 de verdade.
 */
export function LegacyDocsRedirect() {
  const { pathname } = useLocation();
  const paths = useDocsPaths();
  const segments = paths.segments(pathname);

  const query = useResolvedPath(segments);
  const t = useMessages();

  if (query.isLoading) return <p>{t('state.loading')}</p>;
  if (query.isError) return <p role="alert">{t('state.pageLoadFailed')}</p>;
  if (!query.data) return <DocsNotFound />;

  const { menuSlug, sectionSlug, pageSlug, tabId } = query.data;
  return <Navigate to={paths.page({ menuSlug, sectionSlug, pageSlug }, tabId)} replace />;
}
