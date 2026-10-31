import { useMemo } from 'react';
import { useRoutes, type RouteObject } from 'react-router-dom';
import type { LocaleCode, PublicSettings } from '@systembook/schema';
import { localeSegment, TOKENS_SEGMENT } from '@systembook/content/site';
import { DocsLocaleProvider, type DocsLocale } from '../content/dataSource.js';
import { usePublicSettings } from '../content/docsQueries.js';
import { UiLocaleProvider } from '../i18n/UiLocale.js';
import { DocsRoutesProvider } from './docsRoutes.js';
import { LegacyDocsRedirect } from './LegacyDocsRedirect.js';
import { PublicHome } from './PublicHome.js';
import { PublicLayout } from './PublicLayout.js';
import { PublicPageView } from './PublicPageView.js';
import { PublicTokensPage } from './PublicTokensPage.js';

/**
 * Árvore de rotas da doc pública montada sob `prefix` (SYS-91): `/docs` no
 * modo CMS, `''` no modo estático. É o único lugar que liga o caminho da rota
 * ao prefixo que os links usam (`DocsRoutesProvider`) — montar as rotas à mão
 * com um e o provider com outro quebraria todo link sem erro nenhum.
 *
 * A base de publicação (`/meu-repo/`) não entra aqui: é o `basename` do router.
 */
export function createDocsRoute(prefix: string): RouteObject {
  const path = prefix.replace(/^\/+|\/+$/g, '');
  return {
    path: path ? `/${path}/*` : '/*',
    element: (
      <DocsRoutesProvider prefix={prefix}>
        <DocsLocaleRoutes />
      </DocsRoutesProvider>
    ),
  };
}

/** As rotas de um idioma, relativas à raiz dele. */
function pageRoutes(): RouteObject[] {
  return [
    { index: true, element: <PublicHome /> },
    // Página Tokens gerada (SYS-140): um segmento, não colide com página nenhuma.
    { path: TOKENS_SEGMENT, element: <PublicTokensPage /> },
    // Forma canônica (SYS-37), com o menu na URL.
    { path: ':menuSlug/:sectionSlug/:pageSlug', element: <PublicPageView /> },
    { path: ':menuSlug/:sectionSlug/:pageSlug/:tabId', element: <PublicPageView /> },
    // Forma legada `:sectionSlug/:pageSlug` (2 segmentos, sem ambiguidade
    // com a canônica) → redirect. A legada COM tab tem 3 segmentos e cai na
    // rota canônica acima; o `PublicPageView` delega ao mesmo componente
    // quando ela não resolve (ver LegacyDocsRedirect).
    { path: ':sectionSlug/:pageSlug', element: <LegacyDocsRedirect /> },
  ];
}

/** Shell da doc num idioma: fonte, caminhos e interface seguem `locale`. */
function localeBranch(value: DocsLocale): RouteObject['element'] {
  return (
    <DocsLocaleProvider value={value}>
      <UiLocaleProvider locale={value.locale}>
        <PublicLayout />
      </UiLocaleProvider>
    </DocsLocaleProvider>
  );
}

/**
 * Rotas por idioma (SYS-176). Os idiomas vêm das settings, então as rotas só
 * existem depois delas: cada idioma não padrão ganha um ramo sob o próprio
 * segmento (`pt-br/…`) e o padrão fica sem prefixo. Segmento estático ganha de
 * segmento dinâmico no React Router, então `/pt-br/a/b/c` é a página `a/b/c`
 * em português, não a tab `c` de `pt-br/a/b`; um prefixo que não é idioma
 * configurado cai nas rotas do padrão (pode ser o slug de um menu). Com um
 * idioma só, as rotas são as de antes.
 */
function DocsLocaleRoutes() {
  const settings = usePublicSettings();
  // Por valor: refazer as settings (o logo trocado no admin) não remonta as rotas.
  const key = JSON.stringify([settings.data?.defaultLocale, settings.data?.locales]);
  const routes = useMemo(() => localeRoutes(settings.data), [key]);
  const element = useRoutes(routes);
  // Sem as settings ainda não se sabe se o 1º segmento é idioma ou menu.
  // Com falha, a doc segue no padrão (as rotas de antes).
  if (settings.isPending) return null;
  return element;
}

function localeRoutes(settings: PublicSettings | undefined): RouteObject[] {
  const defaultLocale: LocaleCode | null = settings?.defaultLocale ?? null;
  const locales = settings?.locales ?? [];
  return [
    ...locales
      .filter(({ code }) => code !== defaultLocale)
      .map((info) => ({
        path: localeSegment(info.code),
        element: localeBranch({ locale: info.code, defaultLocale, locales }),
        children: pageRoutes(),
      })),
    { element: localeBranch({ locale: defaultLocale, defaultLocale, locales }), children: pageRoutes() },
  ];
}
