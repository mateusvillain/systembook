import { desc, sql } from 'drizzle-orm';
import type { TokenSet } from '@systembook/schema';
import type { Db } from './client.js';
import { tokenSets } from './schema.js';

/** Uma publicação de tokens com o conjunto já lido do JSON. */
export interface PublishedTokenSet {
  id: string;
  commitSha: string;
  publicadoEm: Date;
  tokenSet: TokenSet;
}

function toPublished(row: typeof tokenSets.$inferSelect): PublishedTokenSet {
  return {
    id: row.id,
    commitSha: row.commitSha,
    publicadoEm: row.publicadoEm,
    tokenSet: JSON.parse(row.conteudoJson) as TokenSet,
  };
}

/**
 * Ponto de escrita do upload de tokens (SYS-142) — sempre insert, nunca
 * upsert (histórico append-only, como `insertComponentPreview`). Quem chama
 * entrega o `TokenSet` já validado.
 */
export function insertTokenSet(
  db: Db,
  params: {
    commitSha: string;
    tokenSet: TokenSet;
    /** Default: agora (unixepoch do SQLite). */
    publicadoEm?: Date;
  },
): PublishedTokenSet {
  const row = db
    .insert(tokenSets)
    .values({
      commitSha: params.commitSha,
      conteudoJson: JSON.stringify(params.tokenSet),
      ...(params.publicadoEm !== undefined && { publicadoEm: params.publicadoEm }),
    })
    .returning()
    .get();
  return toPublished(row);
}

/**
 * Última publicação de tokens — "latest wins" para a doc pública (SYS-143),
 * ou `null` se nunca houve upload. Desempate por rowid além de publicado_em:
 * unixepoch tem resolução de segundo e dois uploads do mesmo CI podem cair no
 * mesmo segundo (mesma lição de `getLatestPreview`).
 */
export function getLatestTokenSet(db: Db): PublishedTokenSet | null {
  const row = db
    .select()
    .from(tokenSets)
    .orderBy(desc(tokenSets.publicadoEm), desc(sql`${tokenSets}.rowid`))
    .limit(1)
    .get();
  return row ? toPublished(row) : null;
}
