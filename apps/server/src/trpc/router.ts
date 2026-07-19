import { router } from './init.js';
import { authRouter } from './routers/auth.js';
import { healthRouter } from './routers/health.js';
import { pagesRouter } from './routers/pages.js';
import { sectionsRouter } from './routers/sections.js';
import { tabsRouter } from './routers/tabs.js';
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
 * | sections | list, create, rename, reorder, delete             | protectedProcedure (admin + editor)  |
 * | pages    | listBySection, create, rename, updateSlug,        | protectedProcedure (admin + editor)  |
 * |          | reorder, delete                                   |                                      |
 * | tabs     | listByPage, create, rename, reorder, delete       | protectedProcedure (admin + editor)  |
 *
 * Decisão de escopo do PRD: `editor` tem CRUD completo sobre a estrutura de
 * navegação (sections/pages/tabs) — e, nas próximas fases, sobre conteúdo
 * (blocks/revisions). Somente gestão de usuários é exclusiva de `admin`.
 * Rotas novas que toquem estrutura/conteúdo devem usar protectedProcedure por
 * padrão, salvo nova decisão explícita. A fronteira é travada pelos testes em
 * permissions.test.ts.
 *
 * Routers de feature das próximas fases (blocks, revisions, previews) são
 * adicionados aqui.
 */
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  users: usersRouter,
  sections: sectionsRouter,
  pages: pagesRouter,
  tabs: tabsRouter,
});

export type AppRouter = typeof appRouter;
