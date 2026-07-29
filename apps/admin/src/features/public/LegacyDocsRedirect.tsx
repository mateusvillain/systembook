import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';
import { DocsNotFound } from './DocsNotFound.js';

/**
 * Compatibilidade das URLs de `/docs` publicadas antes de o menu entrar no
 * path (SYS-37). Pega os segmentos crus da URL, pede a forma canônica ao
 * servidor (`pages.resolvePublicPath`, que desambigua `menu/section/page` de
 * `section/page/tab` por dado, não por heurística) e redireciona com
 * `replace` — o endereço antigo não fica no histórico.
 *
 * Serve dois casos: a rota de 2 segmentos, que só pode ser legada, e o
 * fallback do `PublicPageView` quando um path de 3 segmentos não resolve como
 * canônico. Quando nada resolve, é um 404 de verdade.
 */
export function LegacyDocsRedirect() {
  const trpc = useTRPC();
  const { pathname } = useLocation();
  const segments = pathname.replace(/^\/docs\/?/, '').split('/').filter(Boolean);

  const query = useQuery({
    ...trpc.pages.resolvePublicPath.queryOptions({ segments }),
    enabled: segments.length >= 2 && segments.length <= 4,
  });

  if (query.isLoading) return <p>Loading…</p>;
  if (query.isError) return <p role="alert">Failed to load the page.</p>;
  if (!query.data) return <DocsNotFound />;

  const { menuSlug, sectionSlug, pageSlug, tabId } = query.data;
  const canonical = `/docs/${menuSlug}/${sectionSlug}/${pageSlug}${tabId ? `/${tabId}` : ''}`;
  return <Navigate to={canonical} replace />;
}
