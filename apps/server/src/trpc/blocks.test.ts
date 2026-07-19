import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, revisions, users } from '../db/schema.js';
import type { TiptapDoc } from '../blocks/serialize.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

const DOC: TiptapDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Uso' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Olá' }] },
    { type: 'callout', attrs: { variant: 'tip' }, content: [{ type: 'paragraph' }] },
  ],
};

describe('blocks router (TASK-31/32)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let tabId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-blocks-router-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);

    const user = db
      .insert(users)
      .values({ nome: 'editor', email: 'editor@test.local', senhaHash: 'irrelevante' })
      .returning({ id: users.id })
      .get();
    db.insert(memberships).values({ userId: user.id, role: 'editor' }).run();
    editor = { userId: user.id, role: 'editor', sessionId: 'fake-session' };

    const caller = callerFor(db, editor);
    const section = await caller.sections.create({ titulo: 'Componentes' });
    const page = await caller.pages.create({ sectionId: section.id, titulo: 'Button', slug: 'button' });
    tabId = (await caller.tabs.create({ pageId: page.id, titulo: 'Usage' })).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('getByTab de tab nunca salva retorna doc null; tab inexistente dá NOT_FOUND', async () => {
    const caller = callerFor(db, editor);
    await expect(caller.blocks.getByTab({ tabId })).resolves.toEqual({ doc: null, blocks: [] });
    await expect(caller.blocks.getByTab({ tabId: 'nao-existe' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('saveDraft persiste e getByTab devolve o doc round-trip', async () => {
    const caller = callerFor(db, editor);
    const saved = await caller.blocks.saveDraft({ tabId, doc: DOC });
    expect(saved).toEqual({ ok: true, blockCount: 3 });

    const loaded = await caller.blocks.getByTab({ tabId });
    expect(loaded.doc).toEqual(DOC);
    expect(loaded.blocks.map((b) => b.tipo)).toEqual(['heading', 'paragraph', 'callout']);
  });

  it('saveDraft substitui o rascunho anterior por completo', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: DOC });
    const menor: TiptapDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Só isso' }] }],
    };
    await caller.blocks.saveDraft({ tabId, doc: menor });

    const loaded = await caller.blocks.getByTab({ tabId });
    expect(loaded.doc).toEqual(menor);
    expect(loaded.blocks).toHaveLength(1);
  });

  it('saveDraft em tab inexistente dá NOT_FOUND; nó desconhecido dá BAD_REQUEST', async () => {
    const caller = callerFor(db, editor);
    await expect(caller.blocks.saveDraft({ tabId: 'nao-existe', doc: DOC })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      caller.blocks.saveDraft({ tabId, doc: { type: 'doc', content: [{ type: 'iframe' }] } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    // o rascunho não foi tocado pela tentativa inválida
    await expect(caller.blocks.getByTab({ tabId })).resolves.toMatchObject({ doc: null });
  });

  it('saveDraft nunca cria revisão (separação autosave × publish)', async () => {
    await callerFor(db, editor).blocks.saveDraft({ tabId, doc: DOC });
    expect(db.select().from(revisions).all()).toHaveLength(0);
  });

  it('não autenticado recebe UNAUTHORIZED', async () => {
    const caller = callerFor(db, null);
    await expect(caller.blocks.getByTab({ tabId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(caller.blocks.saveDraft({ tabId, doc: DOC })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
