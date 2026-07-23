import { router } from './init.js';
import { authRouter } from './routers/auth.js';
import { blocksRouter } from './routers/blocks.js';
import { componentPreviewsRouter } from './routers/componentPreviews.js';
import { healthRouter } from './routers/health.js';
import { landingRouter } from './routers/landing.js';
import { menusRouter } from './routers/menus.js';
import { pagesRouter } from './routers/pages.js';
import { revisionsRouter } from './routers/revisions.js';
import { searchRouter } from './routers/search.js';
import { sectionsRouter } from './routers/sections.js';
import { tabsRouter } from './routers/tabs.js';
import { uploadTokensRouter } from './routers/uploadTokens.js';
import { usersRouter } from './routers/users.js';

/**
 * Matriz de permissões (TASK-24) — referência única por router:
 *
 * | Router   | Procedures                                        | Nível exigido                        |
 * | -------- | ------------------------------------------------- | ------------------------------------ |
 * | health   | check                                             | publicProcedure                      |
 * | auth     | login, me                                         | publicProcedure                      |
 * | auth     | logout                                            | protectedProcedure (admin + editor)  |
 * | users    | list, create, update, deactivate, resetPassword   | adminProcedure (só admin)            |
 * | menus    | list, create, rename, reorder, delete              | protectedProcedure (admin + editor)  |
 * | sections | list, listByMenu, create, rename, reorder, delete | protectedProcedure (admin + editor)  |
 * | sections | listPublic                                        | publicProcedure (doc pública)        |
 * | pages     | listBySection, create, rename, updateSlug,       | protectedProcedure (admin + editor)  |
 * |           | reorder, delete, publish, restoreRevision        |                                       |
 * | pages     | getPublishedBySlug                                | publicProcedure (doc pública)        |
 * | tabs      | listByPage, getPrimary, create, rename,          | protectedProcedure (admin + editor)  |
 * |           | reorder, delete                                  |                                       |
 * | blocks    | getByTab, saveDraft                              | protectedProcedure (admin + editor)  |
 * | revisions | listByPage, listRecent, getById                  | protectedProcedure (admin + editor)  |
 * | revisions | getLatestPublished                               | publicProcedure (doc pública)        |
 * | componentPreviews | listComponents, listVariants             | protectedProcedure (admin + editor)  |
 * | componentPreviews | getLatest                                | publicProcedure (embed público)      |
 * | search    | query                                             | publicProcedure (busca pública)      |
 * | search    | structure                                         | protectedProcedure (admin + editor)  |
 * | landing   | get                                               | publicProcedure (raiz pública)       |
 * | landing   | getEditorTarget                                   | protectedProcedure (admin + editor)  |
 * | uploadTokens | list, create, revoke                          | adminProcedure (só admin)            |
 *
 * Decisão de escopo do PRD: `editor` tem CRUD completo sobre a estrutura de
 * navegação (sections/pages/tabs) e sobre conteúdo (blocks/revisions, via
 * `pages.publish`/`pages.restoreRevision`, TASK-34/36). Somente gestão de
 * usuários é exclusiva de `admin`. Rotas novas que toquem estrutura/conteúdo
 * devem usar protectedProcedure por padrão, salvo nova decisão explícita. A
 * fronteira é travada pelos testes em permissions.test.ts.
 *
 * Routers de feature das próximas fases (previews) são adicionados aqui.
 */
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  users: usersRouter,
  menus: menusRouter,
  sections: sectionsRouter,
  pages: pagesRouter,
  tabs: tabsRouter,
  blocks: blocksRouter,
  revisions: revisionsRouter,
  componentPreviews: componentPreviewsRouter,
  search: searchRouter,
  landing: landingRouter,
  uploadTokens: uploadTokensRouter,
});

export type AppRouter = typeof appRouter;
