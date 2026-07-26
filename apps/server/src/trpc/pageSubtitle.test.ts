import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, users } from '../db/schema.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

describe('pages.setSubtitulo e header.subtitulo (TASK-99)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-subtitle-'));
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

  async function makePage() {
    const caller = callerFor(db, editor);
    const menu = await caller.menus.create({ titulo: 'Menu' });
    const sec = await caller.sections.create({ menuId: menu.id, titulo: 'Seção' });
    const page = await caller.pages.create({ sectionId: sec.id, titulo: 'Página', slug: 'pagina' });
    return { caller, page };
  }

  it('nasce sem subtítulo (null) e o header o expõe', async () => {
    const { caller, page } = await makePage();
    expect((await caller.pages.header({ pageId: page.id })).page.subtitulo).toBeNull();
  });

  it('salva, atualiza e limpa o subtítulo; string vazia/whitespace vira null', async () => {
    const { caller, page } = await makePage();

    await caller.pages.setSubtitulo({ id: page.id, subtitulo: '  Uma introdução  ' });
    expect((await caller.pages.header({ pageId: page.id })).page.subtitulo).toBe('Uma introdução');

    await caller.pages.setSubtitulo({ id: page.id, subtitulo: 'Outra' });
    expect((await caller.pages.header({ pageId: page.id })).page.subtitulo).toBe('Outra');

    await caller.pages.setSubtitulo({ id: page.id, subtitulo: '   ' });
    expect((await caller.pages.header({ pageId: page.id })).page.subtitulo).toBeNull();
  });

  it('NOT_FOUND em página ausente', async () => {
    const { caller } = await makePage();
    await expect(caller.pages.setSubtitulo({ id: 'ausente', subtitulo: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
