import { sql } from 'drizzle-orm';
import { publicProcedure, router } from '../init.js';

export const healthRouter = router({
  check: publicProcedure.query(({ ctx }) => {
    let db: 'ok' | 'error' = 'ok';
    try {
      ctx.db.get(sql`SELECT 1`);
    } catch {
      db = 'error';
    }
    return { status: 'ok' as const, db };
  }),
});
