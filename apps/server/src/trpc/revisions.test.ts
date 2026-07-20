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

const USAGE_V1: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Versão 1' }] }],
};
const USAGE_V2: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Versão 2' }] }],
};

describe('revisions router (TASK-35) + pages.restoreRevision (TASK-36)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let pageId: string;
  let tabId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-revisions-router-'));
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
    pageId = (await caller.pages.create({ sectionId: section.id, titulo: 'Button', slug: 'button' })).id;
    tabId = (await caller.tabs.create({ pageId, titulo: 'Usage' })).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('listByPage lista revisões mais recentes primeiro, com email do autor', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
    const r1 = await caller.pages.publish({ pageId, mensagem: 'Primeira' });
    await caller.blocks.saveDraft({ tabId, doc: USAGE_V2 });
    const r2 = await caller.pages.publish({ pageId, mensagem: 'Segunda' });

    const list = await caller.revisions.listByPage({ pageId });
    expect(list.map((r) => r.id)).toEqual([r2.id, r1.id]);
    expect(list[0]).toMatchObject({ mensagem: 'Segunda', autorEmail: 'editor@test.local' });
  });

  it('getById devolve o snapshot completo parseado; inexistente dá NOT_FOUND', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
    const r1 = await caller.pages.publish({ pageId, mensagem: 'Primeira' });

    const full = await caller.revisions.getById({ id: r1.id });
    expect(full.snapshot.tabs).toHaveLength(1);
    expect(full.snapshot.tabs[0]?.blocks[0]).toMatchObject({ type: 'paragraph' });
    expect(full.autorEmail).toBe('editor@test.local');

    await expect(caller.revisions.getById({ id: 'nao-existe' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('não autenticado recebe UNAUTHORIZED em listByPage/getById', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
    const r1 = await caller.pages.publish({ pageId });

    const anon = callerFor(db, null);
    await expect(anon.revisions.listByPage({ pageId })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(anon.revisions.getById({ id: r1.id })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('restoreRevision substitui os blocks atuais pelo snapshot e encadeia uma nova revisão', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
    const r1 = await caller.pages.publish({ pageId, mensagem: 'Primeira' });
    await caller.blocks.saveDraft({ tabId, doc: USAGE_V2 });
    await caller.pages.publish({ pageId, mensagem: 'Segunda' });

    const result = await caller.pages.restoreRevision({ pageId, revisionId: r1.id });
    expect(result.skippedTabIds).toEqual([]);
    expect(result.revision.autorId).toBe(editor.userId);
    expect(result.revision.mensagem).toMatch(/^Restaurado da revisão de /);

    // blocks (rascunho ao vivo) agora refletem a v1 restaurada
    const draft = await caller.blocks.getByTab({ tabId });
    expect(draft.doc).toEqual(USAGE_V1);

    // e a nova revisão encadeada também captura esse mesmo estado
    const newest = await caller.revisions.getById({ id: result.revision.id });
    expect(newest.snapshot.tabs[0]?.blocks[0]).toMatchObject({
      content: { body: [{ type: 'text', text: 'Versão 1' }] },
    });

    // histórico cresceu (append-only): 2 publishes + 1 restore = 3 revisões
    expect(db.select().from(revisions).all()).toHaveLength(3);
  });

  it('restoreRevision pula tabs que não existem mais e reporta em skippedTabIds', async () => {
    const caller = callerFor(db, editor);
    const otherTabId = (await caller.tabs.create({ pageId, titulo: 'Code' })).id;
    await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
    await caller.blocks.saveDraft({ tabId: otherTabId, doc: USAGE_V1 });
    const r1 = await caller.pages.publish({ pageId, mensagem: 'Com duas tabs' });

    await caller.tabs.delete({ id: otherTabId });

    const result = await caller.pages.restoreRevision({ pageId, revisionId: r1.id });
    expect(result.skippedTabIds).toEqual([otherTabId]);

    const draft = await caller.blocks.getByTab({ tabId });
    expect(draft.doc).toEqual(USAGE_V1);
  });

  it('restoreRevision com revisão de outra página ou inexistente dá NOT_FOUND', async () => {
    const caller = callerFor(db, editor);
    await expect(caller.pages.restoreRevision({ pageId, revisionId: 'nao-existe' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const section2 = await caller.sections.create({ titulo: 'Outra seção' });
    const otherPageId = (
      await caller.pages.create({ sectionId: section2.id, titulo: 'Input', slug: 'input' })
    ).id;
    const otherRevision = await caller.pages.publish({ pageId: otherPageId });

    await expect(
      caller.pages.restoreRevision({ pageId, revisionId: otherRevision.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('não autenticado recebe UNAUTHORIZED em restoreRevision', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
    const r1 = await caller.pages.publish({ pageId });

    const anon = callerFor(db, null);
    await expect(anon.pages.restoreRevision({ pageId, revisionId: r1.id })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
