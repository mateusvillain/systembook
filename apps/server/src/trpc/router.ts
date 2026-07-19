import { router } from './init.js';
import { authRouter } from './routers/auth.js';
import { healthRouter } from './routers/health.js';
import { pagesRouter } from './routers/pages.js';
import { sectionsRouter } from './routers/sections.js';
import { tabsRouter } from './routers/tabs.js';
import { usersRouter } from './routers/users.js';

// Routers de feature das próximas fases (blocks, revisions, previews) são
// adicionados aqui.
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  users: usersRouter,
  sections: sectionsRouter,
  pages: pagesRouter,
  tabs: tabsRouter,
});

export type AppRouter = typeof appRouter;
