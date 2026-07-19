import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

/**
 * Estrutura de navegação (Fase 2): sections → pages → tabs.
 *
 * `ordem` é um inteiro simples renumerado pela aplicação a cada reorder
 * (0..n-1 dentro do pai), sem unique index — a leitura ordena por
 * (ordem, id) para desempate determinístico caso haja empate transitório.
 * Deleção é hard delete com FK cascade em toda a árvore (decisão TASK-18).
 */

export const sections = sqliteTable('sections', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  titulo: text('titulo').notNull(),
  ordem: integer('ordem').notNull(),
});

// Slug único por section (não global): duas sections podem ter "overview".
export const pages = sqliteTable(
  'pages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sectionId: text('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    titulo: text('titulo').notNull(),
    slug: text('slug').notNull(),
    ordem: integer('ordem').notNull(),
  },
  (table) => [uniqueIndex('pages_section_slug_unique').on(table.sectionId, table.slug)],
);

// Título livre (Usage, Code, Accessibility ou custom) e sem unicidade por
// page — duplicar nome de tab é uma simplificação aceita do MVP (TASK-21).
export const tabs = sqliteTable('tabs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  pageId: text('page_id')
    .notNull()
    .references(() => pages.id, { onDelete: 'cascade' }),
  titulo: text('titulo').notNull(),
  ordem: integer('ordem').notNull(),
});
