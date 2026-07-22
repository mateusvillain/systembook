import { z } from 'zod';
import { searchPublishedPages, searchStructure } from '../../db/search.js';
import { protectedProcedure, publicProcedure, router } from '../init.js';

/**
 * Busca full-text pública (TASK-53) sobre o conteúdo publicado, servida pelo
 * índice FTS5 `pages_fts`. publicProcedure: a busca é da doc pública, sem auth.
 * Só páginas com revisão publicada aparecem (elas nunca foram indexadas de
 * outra forma) e o resultado já vem rankeado com snippet destacado.
 *
 * `structure` (TASK-91) é a contraparte do painel admin: casa **títulos** da
 * árvore de navegação (menus/seções/páginas/tabs), incluindo estrutura não
 * publicada — por isso `protectedProcedure`, nunca público.
 */
export const searchRouter = router({
  query: publicProcedure
    .input(z.object({ q: z.string().min(1) }))
    .query(({ ctx, input }) => searchPublishedPages(ctx.db, input.q)),

  structure: protectedProcedure
    .input(z.object({ q: z.string().min(1) }))
    .query(({ ctx, input }) => searchStructure(ctx.db, input.q)),
});
