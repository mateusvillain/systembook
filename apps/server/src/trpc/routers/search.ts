import { z } from 'zod';
import { searchPublishedPages } from '../../db/search.js';
import { publicProcedure, router } from '../init.js';

/**
 * Busca full-text pública (TASK-53) sobre o conteúdo publicado, servida pelo
 * índice FTS5 `pages_fts`. publicProcedure: a busca é da doc pública, sem auth.
 * Só páginas com revisão publicada aparecem (elas nunca foram indexadas de
 * outra forma) e o resultado já vem rankeado com snippet destacado.
 */
export const searchRouter = router({
  query: publicProcedure
    .input(z.object({ q: z.string().min(1) }))
    .query(({ ctx, input }) => searchPublishedPages(ctx.db, input.q)),
});
