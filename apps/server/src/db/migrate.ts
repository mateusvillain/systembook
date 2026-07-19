import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './client.js';

// Em dev (tsx) __dirname = src/db; no build = dist/db. A pasta drizzle/ fica
// na raiz do pacote em ambos os casos.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: path.join(packageRoot, 'drizzle') });
}
