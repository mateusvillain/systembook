import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { backfillRevisionTypes } from '../db/revisions.js';
import { DEFAULT_MENU_ID, memberships, revisions, users } from '../db/schema.js';
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
    const section = await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'Componentes' });
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

  describe('listRecent (TASK-69) — feed do painel inteiro', () => {
    it('agrega revisões de todas as páginas, mais recentes primeiro (desempate por rowid)', async () => {
      const caller = callerFor(db, editor);
      const section = await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'Padrões' });
      const page2 = await caller.pages.create({ sectionId: section.id, titulo: 'Cores', slug: 'cores' });
      const tab2 = await caller.tabs.create({ pageId: page2.id, titulo: 'Tokens' });

      await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
      const r1 = await caller.pages.publish({ pageId, mensagem: 'p1' });
      await caller.blocks.saveDraft({ tabId: tab2.id, doc: USAGE_V1 });
      const r2 = await caller.pages.publish({ pageId: page2.id, mensagem: 'p2' });
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V2 });
      const r3 = await caller.pages.publish({ pageId, mensagem: 'p3' });

      const feed = await caller.revisions.listRecent({});
      // publishes no mesmo segundo (unixepoch) → ordem = inserção desc (rowid)
      expect(feed.items.map((r) => r.id)).toEqual([r3.id, r2.id, r1.id]);
      // cada entrada traz página (título), seção e autor
      expect(feed.items[0]).toMatchObject({
        pageId,
        pageTitulo: 'Button',
        sectionTitulo: 'Componentes',
        autorEmail: 'editor@test.local',
      });
      expect(feed.items[1]).toMatchObject({ pageId: page2.id, pageTitulo: 'Cores' });
      // tudo coube numa página só
      expect(feed.nextCursor).toBeNull();
    });

    it('respeita o limit', async () => {
      const caller = callerFor(db, editor);
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
      await caller.pages.publish({ pageId, mensagem: 'a' });
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V2 });
      await caller.pages.publish({ pageId, mensagem: 'b' });
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
      const last = await caller.pages.publish({ pageId, mensagem: 'c' });

      const feed = await caller.revisions.listRecent({ limit: 2 });
      expect(feed.items).toHaveLength(2);
      expect(feed.items[0]?.id).toBe(last.id);
    });

    it('autor removido (hard delete → SET NULL) aparece com autorEmail null', async () => {
      const caller = callerFor(db, editor);
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
      await caller.pages.publish({ pageId, mensagem: 'x' });

      // hard delete do autor: revisions.autor_id vira NULL (SET NULL)
      db.delete(users).where(eq(users.id, editor.userId)).run();

      const feed = await caller.revisions.listRecent({});
      expect(feed.items).toHaveLength(1);
      expect(feed.items[0]?.autorEmail).toBeNull();
      expect(feed.items[0]?.pageTitulo).toBe('Button');
    });

    it('não autenticado recebe UNAUTHORIZED', async () => {
      await expect(callerFor(db, null).revisions.listRecent({})).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    // ---- SYS-69 ----

    it('classifica publish e restore por dado, não pela mensagem', async () => {
      const caller = callerFor(db, editor);
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
      const primeira = await caller.pages.publish({ pageId, mensagem: 'v1' });
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V2 });
      // Mensagem de publish imitando a frase que o restore gera: antes da
      // SYS-69 isto aparecia como "restaurou" no feed.
      const impostora = await caller.pages.publish({
        pageId,
        mensagem: 'Restored from the revision of 2020-01-01T00:00:00.000Z',
      });
      const restore = await caller.pages.restoreRevision({ pageId, revisionId: primeira.id });

      const feed = await caller.revisions.listRecent({});
      const byId = new Map(feed.items.map((r) => [r.id, r.tipo]));
      expect(byId.get(restore.revision.id)).toBe('restore');
      expect(byId.get(impostora.id)).toBe('publish');
      expect(byId.get(primeira.id)).toBe('publish');
    });

    it('pagina por keyset, sem repetir nem pular no empate de segundo', async () => {
      const caller = callerFor(db, editor);
      const publicados: string[] = [];
      for (let i = 0; i < 5; i++) {
        await caller.blocks.saveDraft({ tabId, doc: i % 2 === 0 ? USAGE_V1 : USAGE_V2 });
        publicados.push((await caller.pages.publish({ pageId, mensagem: `p${i}` })).id);
      }
      // Todos no mesmo segundo: é exatamente o caso em que um cursor só de
      // timestamp perderia ou repetiria linhas.
      const esperado = [...publicados].reverse();

      const p1 = await caller.revisions.listRecent({ limit: 2 });
      expect(p1.items.map((r) => r.id)).toEqual(esperado.slice(0, 2));
      expect(p1.nextCursor).not.toBeNull();

      const p2 = await caller.revisions.listRecent({ limit: 2, cursor: p1.nextCursor });
      expect(p2.items.map((r) => r.id)).toEqual(esperado.slice(2, 4));

      const p3 = await caller.revisions.listRecent({ limit: 2, cursor: p2.nextCursor });
      expect(p3.items.map((r) => r.id)).toEqual(esperado.slice(4));
      expect(p3.nextCursor).toBeNull();
    });

    it('publicar durante a paginação não faz a página seguinte repetir itens', async () => {
      const caller = callerFor(db, editor);
      const publicados: string[] = [];
      for (let i = 0; i < 4; i++) {
        await caller.blocks.saveDraft({ tabId, doc: i % 2 === 0 ? USAGE_V1 : USAGE_V2 });
        publicados.push((await caller.pages.publish({ pageId, mensagem: `p${i}` })).id);
      }

      const p1 = await caller.revisions.listRecent({ limit: 2 });
      // Alguém publica enquanto o leitor está na primeira página. Com OFFSET,
      // a lista inteira desceria uma posição e a página 2 repetiria um item.
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
      await caller.pages.publish({ pageId, mensagem: 'intrusa' });

      const p2 = await caller.revisions.listRecent({ limit: 2, cursor: p1.nextCursor });
      const vistos = [...p1.items, ...p2.items].map((r) => r.id);
      expect(new Set(vistos).size).toBe(vistos.length);
    });

    it('devolve a seção e o menu da página, para a tela navegar direto', async () => {
      const caller = callerFor(db, editor);
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
      await caller.pages.publish({ pageId });

      const feed = await caller.revisions.listRecent({});
      expect(feed.items[0]).toMatchObject({
        sectionTitulo: 'Componentes',
        menuId: DEFAULT_MENU_ID,
      });
    });

    it('revisões antigas (sem tipo) são classificadas pelo backfill', async () => {
      const caller = callerFor(db, editor);
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
      const rev = await caller.pages.publish({ pageId, mensagem: 'v1' });
      await caller.pages.restoreRevision({ pageId, revisionId: rev.id });

      // Simula o estado pré-migration: tudo gravado como 'publish'.
      db.run(sql`UPDATE revisions SET tipo = 'publish'`);
      expect(backfillRevisionTypes(db)).toEqual({ updated: 1 });

      const feed = await caller.revisions.listRecent({});
      expect(feed.items.filter((r) => r.tipo === 'restore')).toHaveLength(1);
      // Idempotente: rodar de novo não muda nada.
      expect(backfillRevisionTypes(db)).toEqual({ updated: 0 });
    });
  });

  it('getById devolve o snapshot completo parseado; inexistente dá NOT_FOUND', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
    const r1 = await caller.pages.publish({ pageId, mensagem: 'Primeira' });

    const full = await caller.revisions.getById({ id: r1.id });
    // tab primária (corpo) + a tab de usuário 'Usage' (TASK-66)
    expect(full.snapshot.tabs).toHaveLength(2);
    expect(full.snapshot.tabs.find((t) => t.tabId === tabId)?.blocks[0]).toMatchObject({
      type: 'paragraph',
    });
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

  describe('getLatestPublished (TASK-50, público)', () => {
    it('anônimo lê o snapshot da última revisão publicada', async () => {
      const caller = callerFor(db, editor);
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V1 });
      await caller.pages.publish({ pageId, mensagem: 'Primeira' });
      await caller.blocks.saveDraft({ tabId, doc: USAGE_V2 });
      await caller.pages.publish({ pageId, mensagem: 'Segunda' });

      const anon = callerFor(db, null);
      const snapshot = await anon.revisions.getLatestPublished({ pageId });
      expect(snapshot?.tabs.find((t) => t.tabId === tabId)?.blocks[0]).toMatchObject({
        content: { body: [{ type: 'text', text: 'Versão 2' }] },
      });
    });

    it('retorna null quando a página nunca foi publicada', async () => {
      const anon = callerFor(db, null);
      expect(await anon.revisions.getLatestPublished({ pageId })).toBeNull();
    });
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
    expect(result.revision.mensagem).toMatch(/^Restored from the revision of /);

    // blocks (rascunho ao vivo) agora refletem a v1 restaurada
    const draft = await caller.blocks.getByTab({ tabId });
    expect(draft.doc).toEqual(USAGE_V1);

    // e a nova revisão encadeada também captura esse mesmo estado
    const newest = await caller.revisions.getById({ id: result.revision.id });
    expect(newest.snapshot.tabs.find((t) => t.tabId === tabId)?.blocks[0]).toMatchObject({
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

    const section2 = await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'Outra seção' });
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
