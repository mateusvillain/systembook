import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { DEFAULT_MENU_ID, menus, pages, sections, tabs, users, memberships } from '../db/schema.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

describe('menus e sections escopadas (TASK-84)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-menus-router-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    const user = db
      .insert(users)
      .values({ nome: 'Editor', email: 'editor@test.local', senhaHash: 'irrelevante' })
      .returning({ id: users.id })
      .get();
    db.insert(memberships).values({ userId: user.id, role: 'editor' }).run();
    editor = { userId: user.id, role: 'editor', sessionId: 'fake-session' };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('cria, lista, renomeia e deriva slugs únicos', async () => {
    const caller = callerFor(db, editor);
    const first = await caller.menus.create({ titulo: 'Fundamentos' });
    const second = await caller.menus.create({ titulo: 'Fundamentos' });

    expect(first).toMatchObject({ slug: 'fundamentos', ordem: 1 });
    expect(second).toMatchObject({ slug: 'fundamentos-2', ordem: 2 });
    await expect(caller.menus.rename({ id: first.id, titulo: 'Foundation' })).resolves.toMatchObject({
      titulo: 'Foundation',
    });
    expect((await caller.menus.list()).map((menu) => menu.id)).toEqual([
      DEFAULT_MENU_ID,
      first.id,
      second.id,
    ]);
    await expect(caller.menus.rename({ id: 'ausente', titulo: 'X' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('reordena somente com a lista completa', async () => {
    const caller = callerFor(db, editor);
    const a = await caller.menus.create({ titulo: 'A' });
    const b = await caller.menus.create({ titulo: 'B' });
    const orderedIds = [b.id, DEFAULT_MENU_ID, a.id];

    await caller.menus.reorder({ orderedIds });
    expect((await caller.menus.list()).map((menu) => menu.id)).toEqual(orderedIds);
    await expect(caller.menus.reorder({ orderedIds: [a.id] })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('escopa sections por menu e rejeita o pai inexistente', async () => {
    const caller = callerFor(db, editor);
    const foundations = await caller.menus.create({ titulo: 'Fundamentos' });
    const components = await caller.menus.create({ titulo: 'Componentes' });
    const colors = await caller.sections.create({ menuId: foundations.id, titulo: 'Cores' });
    await caller.sections.create({ menuId: components.id, titulo: 'Botões' });

    expect(await caller.sections.listByMenu({ menuId: foundations.id })).toEqual([
      expect.objectContaining({ id: colors.id, titulo: 'Cores', menuId: foundations.id }),
    ]);
    expect(await caller.sections.listByMenu({ menuId: components.id })).toHaveLength(1);
    await expect(caller.sections.create({ menuId: 'ausente', titulo: 'Órfã' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('deletar um menu cascateia sections, pages e tabs', async () => {
    const caller = callerFor(db, editor);
    const menu = await caller.menus.create({ titulo: 'Componentes' });
    const section = await caller.sections.create({ menuId: menu.id, titulo: 'Botões' });
    const page = await caller.pages.create({ sectionId: section.id, titulo: 'Button', slug: 'button' });

    await caller.menus.delete({ id: menu.id });

    expect(db.select().from(menus).where(eq(menus.id, menu.id)).get()).toBeUndefined();
    expect(db.select().from(sections).where(eq(sections.id, section.id)).get()).toBeUndefined();
    expect(db.select().from(pages).where(eq(pages.id, page.id)).get()).toBeUndefined();
    expect(db.select().from(tabs).where(eq(tabs.pageId, page.id)).all()).toEqual([]);
  });

  it('protege menus e listagem escopada contra acesso não autenticado', async () => {
    const anon = callerFor(db, null);
    await expect(anon.menus.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(anon.sections.listByMenu({ menuId: DEFAULT_MENU_ID })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
