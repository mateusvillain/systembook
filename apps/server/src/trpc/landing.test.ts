import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { ensureLandingPage, LANDING_SECTION_ID } from '../db/landing.js';
import { DEFAULT_MENU_ID, memberships, users } from '../db/schema.js';
import type { TiptapDoc } from '../blocks/serialize.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}
const para = (text: string): TiptapDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('landing page (TASK-56)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-landing-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    ensureLandingPage(db); // no boot real roda automaticamente

    const user = db
      .insert(users)
      .values({ nome: 'editor', email: 'editor@test.local', senhaHash: 'x' })
      .returning({ id: users.id })
      .get();
    db.insert(memberships).values({ userId: user.id, role: 'editor' }).run();
    editor = { userId: user.id, role: 'editor', sessionId: 'fake' };
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('ensureLandingPage é idempotente', () => {
    expect(() => {
      ensureLandingPage(db);
      ensureLandingPage(db);
    }).not.toThrow();
  });

  it('landing.get é null antes de publicar e devolve o snapshot depois', async () => {
    const caller = callerFor(db, editor);
    expect((await caller.landing.get()).snapshot).toBeNull();

    const { tabId, pageId } = await caller.landing.getEditorTarget();
    await caller.blocks.saveDraft({ tabId, doc: para('Bem-vindo ao nosso design system') });
    await caller.pages.publish({ pageId });

    const { snapshot } = await caller.landing.get();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.tabs[0]?.blocks[0]).toMatchObject({ type: 'paragraph' });
  });

  it('a landing publicada não aparece na busca nem na árvore de navegação', async () => {
    const caller = callerFor(db, editor);
    const { tabId, pageId } = await caller.landing.getEditorTarget();
    await caller.blocks.saveDraft({ tabId, doc: para('termo landing zephyrantes exclusivo') });
    await caller.pages.publish({ pageId });

    // Fora da busca (reindexPageFts pula o page id reservado).
    expect(await caller.search.query({ q: 'zephyrantes' })).toEqual([]);
    // Fora da navegação pública e da árvore do admin.
    expect(await caller.sections.listPublic()).toEqual([]);
    expect((await caller.sections.list()).some((s) => s.id === LANDING_SECTION_ID)).toBe(false);
  });

  it('getEditorTarget exige autenticação; get é público', async () => {
    const anon = callerFor(db, null);
    await expect(anon.landing.getEditorTarget()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(anon.landing.get()).resolves.toMatchObject({ snapshot: null });
  });

  it('sections.reorder funciona com a section reservada presente (não exige incluí-la)', async () => {
    const caller = callerFor(db, editor);
    const a = await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'A' });
    const b = await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'B' });

    // O cliente só conhece as sections visíveis (list exclui a landing); a
    // reordenação com apenas esses ids não pode falhar por causa da reservada.
    const visible = await caller.sections.list();
    expect(visible.some((s) => s.id === LANDING_SECTION_ID)).toBe(false);

    await expect(
      caller.sections.reorder({ orderedIds: [b.id, a.id] }),
    ).resolves.toEqual({ ok: true });
  });
});
