import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { DEFAULT_MENU_ID, memberships, users } from '../db/schema.js';
import type { TiptapDoc } from '../blocks/serialize.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

function doc(...paragraphs: string[]): TiptapDoc {
  return {
    type: 'doc',
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  };
}

describe('pages.draftStatus (SYS-67)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let sectionId: string;
  let pageId: string;
  let primaryTabId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-draftstatus-'));
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
    sectionId = (await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'Componentes' })).id;
    pageId = (await caller.pages.create({ sectionId, titulo: 'Button', slug: 'button' })).id;
    primaryTabId = (await caller.tabs.getPrimary({ pageId })).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const statusOf = async (ids: string[]) =>
    callerFor(db, editor).pages.draftStatus({ pageIds: ids });

  it('página em branco e nunca publicada não conta como pendente', async () => {
    expect(await statusOf([pageId])).toEqual([
      { pageId, hasUnpublishedChanges: false, neverPublished: true },
    ]);
  });

  it('conteúdo nunca publicado conta como pendente', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('primeiro rascunho') });

    expect(await statusOf([pageId])).toEqual([
      { pageId, hasUnpublishedChanges: true, neverPublished: true },
    ]);
  });

  it('publicar zera a pendência', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('conteúdo') });
    await caller.pages.publish({ pageId });

    expect(await statusOf([pageId])).toEqual([
      { pageId, hasUnpublishedChanges: false, neverPublished: false },
    ]);
  });

  it('editar depois de publicar reacende a pendência', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('versão 1') });
    await caller.pages.publish({ pageId });
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('versão 2') });

    expect((await statusOf([pageId]))[0]).toMatchObject({ hasUnpublishedChanges: true });
  });

  it('salvar o mesmo conteúdo de novo NÃO conta como pendente (ids de bloco mudam, conteúdo não)', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('idêntico') });
    await caller.pages.publish({ pageId });
    // O autosave apaga e reinsere os blocks: ids novos, conteúdo igual. É o
    // caso de "digitei e apaguei" — publicar não mudaria nada.
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('idêntico') });

    expect((await statusOf([pageId]))[0]).toMatchObject({ hasUnpublishedChanges: false });
  });

  it('conta mudança em aba de usuário, não só no corpo', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('corpo') });
    const usageTab = (await caller.tabs.create({ pageId, titulo: 'Usage' })).id;
    await caller.blocks.saveDraft({ tabId: usageTab, doc: doc('uso') });
    await caller.pages.publish({ pageId });
    expect((await statusOf([pageId]))[0]).toMatchObject({ hasUnpublishedChanges: false });

    await caller.blocks.saveDraft({ tabId: usageTab, doc: doc('uso revisado') });
    expect((await statusOf([pageId]))[0]).toMatchObject({ hasUnpublishedChanges: true });
  });

  it('criar uma aba nova (ainda vazia) já é pendência', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('corpo') });
    await caller.pages.publish({ pageId });

    await caller.tabs.create({ pageId, titulo: 'Nova aba' });
    // A aba existe no rascunho e não na revisão: publicar mudaria o que o
    // leitor vê (ganha uma aba), então é pendência.
    expect((await statusOf([pageId]))[0]).toMatchObject({ hasUnpublishedChanges: true });
  });

  it('renomear uma aba já é pendência (nenhum bloco muda)', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('corpo') });
    const usageTab = (await caller.tabs.create({ pageId, titulo: 'Usage' })).id;
    await caller.blocks.saveDraft({ tabId: usageTab, doc: doc('uso') });
    await caller.pages.publish({ pageId });
    expect((await statusOf([pageId]))[0]).toMatchObject({ hasUnpublishedChanges: false });

    await caller.tabs.rename({ id: usageTab, titulo: 'Como usar' });
    expect((await statusOf([pageId]))[0]).toMatchObject({ hasUnpublishedChanges: true });
  });

  it('responde em lote, na ordem pedida, e sem estourar em página inexistente', async () => {
    const caller = callerFor(db, editor);
    const outra = (await caller.pages.create({ sectionId, titulo: 'Card', slug: 'card' })).id;
    const outraTab = (await caller.tabs.getPrimary({ pageId: outra })).id;
    await caller.blocks.saveDraft({ tabId: outraTab, doc: doc('rascunho da outra') });
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('publicada') });
    await caller.pages.publish({ pageId });

    const result = await statusOf([pageId, outra, 'nao-existe']);
    expect(result.map((r) => r.pageId)).toEqual([pageId, outra, 'nao-existe']);
    expect(result[0]).toMatchObject({ hasUnpublishedChanges: false });
    expect(result[1]).toMatchObject({ hasUnpublishedChanges: true, neverPublished: true });
    // Página inexistente: sem conteúdo e sem revisão → nada pendente, sem erro.
    expect(result[2]).toMatchObject({ hasUnpublishedChanges: false, neverPublished: true });
  });

  it('restaurar uma revisão antiga deixa a página pendente de novo', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('v1') });
    const rev1 = await caller.pages.publish({ pageId });
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: doc('v2') });
    await caller.pages.publish({ pageId });

    // O restore grava uma revisão de acompanhamento, então o rascunho e a
    // última revisão voltam a coincidir — sem pendência.
    await caller.pages.restoreRevision({ pageId, revisionId: rev1.id });
    expect((await statusOf([pageId]))[0]).toMatchObject({ hasUnpublishedChanges: false });
  });

  it('lista vazia devolve lista vazia (sem consultar nada)', async () => {
    expect(await statusOf([])).toEqual([]);
  });

  it('não autenticado recebe UNAUTHORIZED', async () => {
    await expect(
      callerFor(db, null).pages.draftStatus({ pageIds: [pageId] }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
