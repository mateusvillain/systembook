import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Tabelas de auth do modelo conceitual (PRD seção 9).
 * IDs são UUID (crypto.randomUUID) em vez de autoincrement, para manter
 * estabilidade em export/import e backup-restore futuros.
 */

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  criadoEm: integer('criado_em', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiraEm: integer('expira_em', { mode: 'timestamp' }).notNull(),
});

// 1 instância = 1 design system — sem coluna de escopo além do role (PRD seção 9).
export const memberships = sqliteTable('memberships', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['admin', 'editor'] }).notNull(),
});
