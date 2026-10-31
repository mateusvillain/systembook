import type { DocsDataSource, LocaleInfo, PageSnapshot, PublishedPage } from '@systembook/schema';
import { trpcClient } from './trpc.js';

/**
 * Idioma único do modo CMS até ele ganhar idiomas (SYS-162): o server ainda
 * não devolve `locales` nem o idioma servido, e o contrato os exige.
 */
const SINGLE_LOCALE: LocaleInfo = { code: 'en', label: 'English' };

/**
 * Fonte de dados da doc pública no modo CMS (SYS-88): cada leitura do
 * `DocsDataSource` é a procedure pública correspondente do servidor.
 *
 * Os casts de `PageSnapshot` existem porque o output "como chega pelo wire"
 * marca os campos `unknown` dos blocos como opcionais (nota em `trpc.ts`); a
 * forma real bate com o contrato, que o server declara como retorno.
 */
export const trpcDataSource: DocsDataSource = {
  getNavTree: () => trpcClient.sections.listPublic.query(),

  getSettings: async () => ({
    ...(await trpcClient.settings.getPublic.query()),
    locales: [SINGLE_LOCALE],
    defaultLocale: SINGLE_LOCALE.code,
  }),

  getLanding: async () => {
    const { snapshot } = await trpcClient.landing.get.query();
    return snapshot as PageSnapshot | null;
  },

  getPageBySlug: async (ref) => {
    const page = await trpcClient.pages.getPublishedBySlug.query(ref);
    if (!page) return null;
    return {
      ...page,
      snapshot: page.snapshot as PublishedPage['snapshot'],
      locale: SINGLE_LOCALE.code,
      alternates: { [SINGLE_LOCALE.code]: ref },
    };
  },

  getPageById: async (pageId) =>
    (await trpcClient.revisions.getLatestPublished.query({ pageId })) as PageSnapshot | null,

  // O server rejeita (BAD_REQUEST) fora de 2–4 segmentos; o contrato pede `null`.
  resolvePath: async (segments) =>
    segments.length >= 2 && segments.length <= 4
      ? trpcClient.pages.resolvePublicPath.query({ segments })
      : null,

  search: (q) => trpcClient.search.query.query({ q }),

  getComponentPreview: async (ref) => {
    const preview = await trpcClient.componentPreviews.getLatest.query(ref);
    return preview && { url: preview.url, config: preview.config };
  },

  getTokens: () => trpcClient.tokens.getLatest.query(),
};
