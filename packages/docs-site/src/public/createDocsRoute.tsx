import type { RouteObject } from 'react-router-dom';
import { DocsRoutesProvider } from './docsRoutes.js';
import { LegacyDocsRedirect } from './LegacyDocsRedirect.js';
import { PublicHome } from './PublicHome.js';
import { PublicLayout } from './PublicLayout.js';
import { PublicPageView } from './PublicPageView.js';

/**
 * Árvore de rotas da doc pública montada sob `prefix` (SYS-91): `/docs` no
 * modo CMS, `''` no modo estático. É o único lugar que liga o caminho da rota
 * ao prefixo que os links usam (`DocsRoutesProvider`) — montar as rotas à mão
 * com um e o provider com outro quebraria todo link sem erro nenhum.
 *
 * A base de publicação (`/meu-repo/`) não entra aqui: é o `basename` do router.
 */
export function createDocsRoute(prefix: string): RouteObject {
  return {
    path: prefix || '/',
    element: (
      <DocsRoutesProvider prefix={prefix}>
        <PublicLayout />
      </DocsRoutesProvider>
    ),
    children: [
      { index: true, element: <PublicHome /> },
      // Forma canônica (SYS-37), com o menu na URL.
      { path: ':menuSlug/:sectionSlug/:pageSlug', element: <PublicPageView /> },
      { path: ':menuSlug/:sectionSlug/:pageSlug/:tabId', element: <PublicPageView /> },
      // Forma legada `:sectionSlug/:pageSlug` (2 segmentos, sem ambiguidade
      // com a canônica) → redirect. A legada COM tab tem 3 segmentos e cai na
      // rota canônica acima; o `PublicPageView` delega ao mesmo componente
      // quando ela não resolve (ver LegacyDocsRedirect).
      { path: ':sectionSlug/:pageSlug', element: <LegacyDocsRedirect /> },
    ],
  };
}
