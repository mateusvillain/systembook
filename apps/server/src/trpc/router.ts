import { router } from './init.js';
import { healthRouter } from './routers/health.js';

// Routers de feature (auth, sections, pages, tabs, previews) são adicionados
// aqui nas fases seguintes.
export const appRouter = router({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
