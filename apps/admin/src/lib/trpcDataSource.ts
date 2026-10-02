import type { DocsDataSource, PageSnapshot, PublishedPage } from '@systembook/schema';
import { trpcClient } from './trpc.js';

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

  getSettings: () => trpcClient.settings.getPublic.query(),

  getLanding: async () => {
    const { snapshot } = await trpcClient.landing.get.query();
    return snapshot as PageSnapshot | null;
  },

  getPageBySlug: async (ref) =>
    (await trpcClient.pages.getPublishedBySlug.query(ref)) as PublishedPage | null,

  getPageById: async (pageId) =>
    (await trpcClient.revisions.getLatestPublished.query({ pageId })) as PageSnapshot | null,

  // O server rejeita (BAD_REQUEST) fora de 2–4 segmentos; o contrato pede `null`.
  resolvePath: async (segments) =>
    segments.length >= 2 && segments.length <= 4
      ? trpcClient.pages.resolvePublicPath.query({ segments })
      : null,

  search: (q) => trpcClient.search.query.query({ q }),
};
