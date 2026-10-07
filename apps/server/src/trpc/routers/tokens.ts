import type { TokenSet } from '@systembook/schema';
import { getLatestTokenSet } from '../../db/tokenSets.js';
import { publicProcedure, router } from '../init.js';

/**
 * Design tokens na doc pública (SYS-143): o `DocsDataSource.getTokens` do modo
 * CMS. publicProcedure como as demais leituras da doc pública — os tokens
 * publicados pelo CI são conteúdo público.
 */
export const tokensRouter = router({
  /**
   * O último conjunto publicado (`getLatestTokenSet`), ou `null` sem nenhum
   * token — a regra do contrato: conjunto vazio não existe, para CMS e
   * estático esconderem o mesmo (`nonEmptyTokenSet`, de que o server não
   * importa em runtime). Uma linha ilegível vira erro da query, que a doc
   * mostra como aviso no lugar dos tokens, sem derrubar a página.
   */
  getLatest: publicProcedure.query(({ ctx }): TokenSet | null => {
    const tokenSet = getLatestTokenSet(ctx.db)?.tokenSet;
    return tokenSet?.tokens.length ? tokenSet : null;
  }),
});
