import { router } from './init.js';
import { authRouter } from './routers/auth.js';
import { healthRouter } from './routers/health.js';
import { usersRouter } from './routers/users.js';

// Routers de feature (sections, pages, tabs, previews) são adicionados
// aqui nas fases seguintes.
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
