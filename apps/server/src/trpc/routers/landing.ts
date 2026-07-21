import { desc, eq, sql } from 'drizzle-orm';
import type { PageSnapshot } from '@systembook/schema';
import { LANDING_PAGE_ID, LANDING_TAB_ID } from '../../db/landing.js';
import { revisions } from '../../db/schema.js';
import { protectedProcedure, publicProcedure, router } from '../init.js';

/**
 * Página inicial customizável da doc (TASK-56). Reusa a máquina de tabs/blocks/
 * revisions via ids reservados (`db/landing.ts`): a edição é o `ContentEditor`
 * comum apontado para `LANDING_TAB_ID` e o publish é `pages.publish` com
 * `LANDING_PAGE_ID`. Aqui só ficam a leitura pública do conteúdo publicado e o
 * alvo de edição para o admin.
 */
export const landingRouter = router({
  /**
   * Conteúdo publicado da landing para a raiz pública (`/docs`). Retorna o
   * `PageSnapshot` da última revisão ou `null` se nunca foi publicada (→ o
   * público mostra o estado padrão). publicProcedure, sem auth.
   */
  get: publicProcedure.query(({ ctx }) => {
    const rev = ctx.db
      .select({ snapshotJson: revisions.snapshotJson })
      .from(revisions)
      .where(eq(revisions.pageId, LANDING_PAGE_ID))
      .orderBy(desc(revisions.criadoEm), desc(sql`${revisions}.rowid`))
      .limit(1)
      .get();

    return { snapshot: rev ? (JSON.parse(rev.snapshotJson) as PageSnapshot) : null };
  }),

  /** Ids reservados que o admin usa para montar o editor + publicar a landing. */
  getEditorTarget: protectedProcedure.query(() => ({
    pageId: LANDING_PAGE_ID,
    tabId: LANDING_TAB_ID,
  })),
});
