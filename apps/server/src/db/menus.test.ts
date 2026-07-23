import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { runMigrations } from './migrate.js';
import { ensureDefaultMenu } from './menus.js';
import { DEFAULT_MENU_ID, menus, sections } from './schema.js';

describe('menu padrão (TASK-83)', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-menus-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('é criado uma vez e recebe sections sem menu explícito', () => {
    ensureDefaultMenu(db);
    ensureDefaultMenu(db);

    expect(db.select().from(menus).all()).toHaveLength(1);

    const section = db
      .insert(sections)
      .values({ titulo: 'Legada', slug: 'legada', ordem: 0 })
      .returning()
      .get();
    expect(section.menuId).toBe(DEFAULT_MENU_ID);
  });

  it('deletar um menu remove suas sections por cascade', () => {
    const menu = db
      .insert(menus)
      .values({ titulo: 'Componentes', slug: 'componentes', ordem: 1 })
      .returning()
      .get();
    const section = db
      .insert(sections)
      .values({ menuId: menu.id, titulo: 'Botões', slug: 'botoes', ordem: 0 })
      .returning()
      .get();

    db.delete(menus).where(eq(menus.id, menu.id)).run();

    expect(db.select().from(sections).where(eq(sections.id, section.id)).get()).toBeUndefined();
  });
});
