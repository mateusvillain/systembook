import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, pages, tabs, users } from '../db/schema.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

describe('pages.move e menus.firstPagePath (TASK-109)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-pagemove-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    const user = db
      .insert(users)
      .values({ nome: 'Editor', email: 'editor@test.local', senhaHash: 'x' })
      .returning({ id: users.id })
      .get();
    db.insert(memberships).values({ userId: user.id, role: 'editor' }).run();
    editor = { userId: user.id, role: 'editor', sessionId: 'fake' };
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('move a página para outra seção preservando tabs/conteúdo e reposicionando no fim', async () => {
    const caller = callerFor(db, editor);
    const menu = await caller.menus.create({ titulo: 'Menu' });
    const secA = await caller.sections.create({ menuId: menu.id, titulo: 'Alfa' });
    const secB = await caller.sections.create({ menuId: menu.id, titulo: 'Beta' });
    // Destino já tem uma página → a movida deve ficar em ordem depois dela.
    await caller.pages.create({ sectionId: secB.id, titulo: 'Existente', slug: 'existente' });
    const page = await caller.pages.create({ sectionId: secA.id, titulo: 'Movida', slug: 'movida' });

    const tabsBefore = db.select().from(tabs).where(eq(tabs.pageId, page.id)).all();
    expect(tabsBefore).toHaveLength(1); // tab primária criada no create

    await expect(caller.pages.move({ pageId: page.id, targetSectionId: secB.id })).resolves.toEqual({
      ok: true,
    });

    const moved = db.select().from(pages).where(eq(pages.id, page.id)).get();
    expect(moved?.sectionId).toBe(secB.id);
    expect(moved?.ordem).toBe(1); // "Existente" tem ordem 0
    // Some da origem, aparece no destino.
    expect((await caller.pages.listBySection({ sectionId: secA.id })).map((p) => p.id)).toEqual([]);
    expect((await caller.pages.listBySection({ sectionId: secB.id })).map((p) => p.id)).toContain(
      page.id,
    );
    // Tabs seguem a página (mesmo pageId).
    expect(db.select().from(tabs).where(eq(tabs.pageId, page.id)).all()).toHaveLength(1);
  });

  it('resolve colisão de slug no destino com sufixo', async () => {
    const caller = callerFor(db, editor);
    const menu = await caller.menus.create({ titulo: 'Menu' });
    const secA = await caller.sections.create({ menuId: menu.id, titulo: 'Alfa' });
    const secB = await caller.sections.create({ menuId: menu.id, titulo: 'Beta' });
    await caller.pages.create({ sectionId: secB.id, titulo: 'Overview', slug: 'overview' });
    const page = await caller.pages.create({ sectionId: secA.id, titulo: 'Overview', slug: 'overview' });

    await caller.pages.move({ pageId: page.id, targetSectionId: secB.id });
    const moved = db.select().from(pages).where(eq(pages.id, page.id)).get();
    expect(moved?.slug).toBe('overview-2');
  });

  it('move para a própria seção é no-op; alvos ausentes dão NOT_FOUND', async () => {
    const caller = callerFor(db, editor);
    const menu = await caller.menus.create({ titulo: 'Menu' });
    const sec = await caller.sections.create({ menuId: menu.id, titulo: 'S' });
    const page = await caller.pages.create({ sectionId: sec.id, titulo: 'P', slug: 'p' });

    await expect(
      caller.pages.move({ pageId: page.id, targetSectionId: sec.id }),
    ).resolves.toEqual({ ok: true });
    expect(db.select().from(pages).where(eq(pages.id, page.id)).get()?.ordem).toBe(0);

    await expect(
      caller.pages.move({ pageId: 'ausente', targetSectionId: sec.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      caller.pages.move({ pageId: page.id, targetSectionId: 'ausente' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('firstPagePath resolve a 1ª página da 1ª seção com conteúdo; null quando vazio', async () => {
    const caller = callerFor(db, editor);
    const menu = await caller.menus.create({ titulo: 'Menu' });
    // Menu sem seções/páginas → null.
    expect(await caller.menus.firstPagePath({ menuId: menu.id })).toBeNull();

    const secA = await caller.sections.create({ menuId: menu.id, titulo: 'Alfa' });
    const secB = await caller.sections.create({ menuId: menu.id, titulo: 'Beta' });
    // secA (ordem 0) fica vazia; a 1ª página com conteúdo está em secB.
    await caller.pages.create({ sectionId: secB.id, titulo: 'Início', slug: 'inicio' });
    await caller.pages.create({ sectionId: secB.id, titulo: 'Depois', slug: 'depois' });

    // O menu entrou no path público (SYS-37), então vem no retorno.
    expect(await caller.menus.firstPagePath({ menuId: menu.id })).toEqual({
      menuSlug: menu.slug,
      sectionSlug: secB.slug,
      pageSlug: 'inicio',
    });

    // Ao dar página à secA (ordem menor), ela passa a ser a resolvida.
    await caller.pages.create({ sectionId: secA.id, titulo: 'Topo', slug: 'topo' });
    expect(await caller.menus.firstPagePath({ menuId: menu.id })).toEqual({
      menuSlug: menu.slug,
      sectionSlug: secA.slug,
      pageSlug: 'topo',
    });
  });
});
