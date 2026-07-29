import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './client.js';
import { backfillMenuSlugs, ensureDefaultMenu } from './menus.js';

// Em dev (tsx) __dirname = src/db; no build = dist/db. A pasta drizzle/ fica
// na raiz do pacote em ambos os casos.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: path.join(packageRoot, 'drizzle') });
  // A migration 0011 dá DEFAULT_MENU_ID às sections legadas. Cria o pai logo
  // após migrar para preservar a integridade referencial também em testes,
  // que chamam runMigrations diretamente em vez de subir o servidor.
  ensureDefaultMenu(db);
  // SYS-37: o slug do menu passou a compor a URL pública, então todo menu
  // precisa ter um — inclusive nos testes, que chamam runMigrations direto em
  // vez de subir o servidor. Idempotente (só toca em `slug IS NULL`); o boot
  // em `index.ts` continua chamando por conta própria.
  backfillMenuSlugs(db);
}
