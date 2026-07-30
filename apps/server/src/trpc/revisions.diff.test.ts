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
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}

/** Texto dos parágrafos de um lado do diff, para asserções legíveis. */
function textOf(block: { content: unknown } | null): string | null {
  if (!block) return null;
  const body = (block.content as { body?: { text?: string }[] }).body ?? [];
  return body.map((n) => n.text ?? '').join('');
}

describe('revisions.diff (SYS-59)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let pageId: string;
  let primaryTabId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-diff-'));
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
    primaryTabId = (await caller.tabs.getPrimary({ pageId })).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Salva o rascunho da tab primária e publica, devolvendo o id da revisão. */
  async function publish(content: TiptapDoc, tabId = primaryTabId) {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: content });
    return (await caller.pages.publish({ pageId })).id;
  }

  it('marca alteração e adição de bloco', async () => {
    const caller = callerFor(db, editor);
    const rev1 = await publish(doc('Intro', 'Meio', 'Fim'));
    // "Fim" muda de texto e um bloco novo entra no final.
    const rev2 = await publish(doc('Intro', 'Meio', 'Fim editado', 'Novo bloco'));

    const result = await caller.revisions.diff({ fromRevisionId: rev1, toRevisionId: rev2 });
    const blocks = result.tabs.find((t) => t.tabId === primaryTabId)!.blocks;

    expect(blocks.map((b) => b.status)).toEqual(['unchanged', 'unchanged', 'changed', 'added']);
    expect(textOf(blocks[2]!.before)).toBe('Fim');
    expect(textOf(blocks[2]!.after)).toBe('Fim editado');
    expect(blocks[3]!.before).toBeNull();
    expect(textOf(blocks[3]!.after)).toBe('Novo bloco');

    expect(result.counts).toEqual({ unchanged: 2, removed: 0, changed: 1, added: 1 });
  });

  it('marca remoção de bloco no meio da página', async () => {
    const caller = callerFor(db, editor);
    const rev1 = await publish(doc('Intro', 'Meio', 'Fim'));
    const rev2 = await publish(doc('Intro', 'Fim'));

    const result = await caller.revisions.diff({ fromRevisionId: rev1, toRevisionId: rev2 });
    const blocks = result.tabs.find((t) => t.tabId === primaryTabId)!.blocks;

    expect(blocks.map((b) => b.status)).toEqual(['unchanged', 'removed', 'unchanged']);
    expect(textOf(blocks[1]!.before)).toBe('Meio');
    expect(blocks[1]!.after).toBeNull();
    expect(result.counts).toEqual({ unchanged: 2, removed: 1, changed: 0, added: 0 });
  });

  it('trecho inteiro substituído: blocos pareiam na ordem, um "alterado" cada', async () => {
    const caller = callerFor(db, editor);
    const rev1 = await publish(doc('Intro', 'Meio', 'Fim'));
    const rev2 = await publish(doc('Intro', 'Outro meio', 'Outro fim'));

    const result = await caller.revisions.diff({ fromRevisionId: rev1, toRevisionId: rev2 });
    const blocks = result.tabs.find((t) => t.tabId === primaryTabId)!.blocks;

    // Dois parágrafos saíram e dois entraram no mesmo lugar: o pareamento
    // posicional descreve isso como duas alterações, não 2 remoções + 2 adições.
    expect(blocks.map((b) => b.status)).toEqual(['unchanged', 'changed', 'changed']);
    expect(textOf(blocks[1]!.before)).toBe('Meio');
    expect(textOf(blocks[1]!.after)).toBe('Outro meio');
  });

  it('inverter a ordem dos argumentos inverte adições e remoções', async () => {
    const caller = callerFor(db, editor);
    const rev1 = await publish(doc('A'));
    const rev2 = await publish(doc('A', 'B'));

    const forward = await caller.revisions.diff({ fromRevisionId: rev1, toRevisionId: rev2 });
    const backward = await caller.revisions.diff({ fromRevisionId: rev2, toRevisionId: rev1 });

    expect(forward.counts).toMatchObject({ added: 1, removed: 0, unchanged: 1 });
    expect(backward.counts).toMatchObject({ added: 0, removed: 1, unchanged: 1 });
    expect(backward.from.id).toBe(rev2);
    expect(backward.to.id).toBe(rev1);
  });

  it('conteúdo idêntico é inalterado mesmo com ids de bloco diferentes', async () => {
    const caller = callerFor(db, editor);
    const rev1 = await publish(doc('Mesmo texto'));
    // Salvar de novo reinsere os blocks (ids novos) sem mudar o conteúdo.
    const rev2 = await publish(doc('Mesmo texto'));

    const blocksRev1 = (await caller.revisions.getById({ id: rev1 })).snapshot.tabs[0]!.blocks;
    const blocksRev2 = (await caller.revisions.getById({ id: rev2 })).snapshot.tabs[0]!.blocks;
    expect(blocksRev1[0]!.id).not.toBe(blocksRev2[0]!.id);

    const result = await caller.revisions.diff({ fromRevisionId: rev1, toRevisionId: rev2 });
    expect(result.counts).toEqual({ unchanged: 1, added: 0, removed: 0, changed: 0 });
    expect(result.tabs.find((t) => t.tabId === primaryTabId)!.status).toBe('unchanged');
  });

  it('troca de tipo no mesmo lugar é remoção + adição, não alteração', async () => {
    const caller = callerFor(db, editor);
    const rev1 = await publish(doc('Vira código'));
    const rev2 = await publish({
      type: 'doc',
      content: [
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1;' }] },
      ],
    });

    const result = await caller.revisions.diff({ fromRevisionId: rev1, toRevisionId: rev2 });
    const blocks = result.tabs.find((t) => t.tabId === primaryTabId)!.blocks;
    expect(blocks.map((b) => b.status).sort()).toEqual(['added', 'removed']);
    expect(result.counts).toMatchObject({ changed: 0 });
  });

  it('tab criada depois entra como adicionada, com todos os blocos adicionados', async () => {
    const caller = callerFor(db, editor);
    const rev1 = await publish(doc('Corpo'));
    const usageTabId = (await caller.tabs.create({ pageId, titulo: 'Usage' })).id;
    const rev2 = await publish(doc('Uso'), usageTabId);

    const result = await caller.revisions.diff({ fromRevisionId: rev1, toRevisionId: rev2 });
    const usage = result.tabs.find((t) => t.tabId === usageTabId)!;
    expect(usage.status).toBe('added');
    expect(usage.titulo).toBe('Usage');
    expect(usage.blocks.every((b) => b.status === 'added')).toBe(true);
    // O corpo, intocado, continua inalterado.
    expect(result.tabs.find((t) => t.tabId === primaryTabId)!.status).toBe('unchanged');
  });

  it('tab excluída aparece como removida ao final', async () => {
    const caller = callerFor(db, editor);
    const usageTabId = (await caller.tabs.create({ pageId, titulo: 'Usage' })).id;
    await caller.blocks.saveDraft({ tabId: usageTabId, doc: doc('Uso') });
    const rev1 = await publish(doc('Corpo'));
    await caller.tabs.delete({ id: usageTabId });
    const rev2 = await publish(doc('Corpo'));

    const result = await caller.revisions.diff({ fromRevisionId: rev1, toRevisionId: rev2 });
    expect(result.tabs.at(-1)).toMatchObject({ tabId: usageTabId, status: 'removed' });
    expect(result.counts).toMatchObject({ removed: 1 });
  });

  it('comparar uma revisão com ela mesma não é erro: tudo inalterado', async () => {
    const caller = callerFor(db, editor);
    const rev = await publish(doc('A', 'B'));

    const result = await caller.revisions.diff({ fromRevisionId: rev, toRevisionId: rev });
    expect(result.counts).toEqual({ unchanged: 2, added: 0, removed: 0, changed: 0 });
  });

  it('revisões de páginas diferentes dão BAD_REQUEST', async () => {
    const caller = callerFor(db, editor);
    const rev1 = await publish(doc('A'));

    const section = await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'Outra' });
    const other = await caller.pages.create({ sectionId: section.id, titulo: 'Card', slug: 'card' });
    const otherRev = await caller.pages.publish({ pageId: other.id });

    await expect(
      caller.revisions.diff({ fromRevisionId: rev1, toRevisionId: otherRev.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('revisão inexistente dá NOT_FOUND', async () => {
    const caller = callerFor(db, editor);
    const rev = await publish(doc('A'));
    await expect(
      caller.revisions.diff({ fromRevisionId: rev, toRevisionId: 'nao-existe' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('não autenticado recebe UNAUTHORIZED', async () => {
    const rev = await publish(doc('A'));
    await expect(
      callerFor(db, null).revisions.diff({ fromRevisionId: rev, toRevisionId: rev }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
