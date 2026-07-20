import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>;

/** Tipo do `tx` recebido por `db.transaction(tx => ...)` — mesma API de query builder do `Db`. */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(databasePath: string) {
  mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}
