import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { DEFAULT_MENU_ID, memberships, revisions, users } from '../db/schema.js';
import type { TiptapDoc } from '../blocks/serialize.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

function paragraph(text: string): TiptapDoc {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function textOf(blocks: { content: unknown }[]): string[] {
  return blocks.map((b) =>
    ((b.content as { body?: { text?: string }[] }).body ?? []).map((n) => n.text ?? '').join(''),
  );
}

describe('pages.getDraftPreview (SYS-57)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let pageId: string;
  let primaryTabId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-draft-preview-'));
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
    const page = await caller.pages.create({ sectionId: section.id, titulo: 'Button', slug: 'button' });
    pageId = page.id;
    primaryTabId = (await caller.tabs.getPrimary({ pageId })).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('devolve o rascunho atual, não a última revisão publicada', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: paragraph('Publicado') });
    await caller.pages.publish({ pageId });
    // Divergência: o rascunho segue adiante depois do publish.
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: paragraph('Rascunho') });

    const preview = await caller.pages.getDraftPreview({ pageId });
    const primary = preview.snapshot.tabs.find((t) => t.isPrimary)!;
    expect(textOf(primary.blocks)).toEqual(['Rascunho']);

    // O publicado não se move — o preview não republica nada.
    const published = await caller.pages.getPublishedBySlug({
      sectionSlug: 'componentes',
      pageSlug: 'button',
    });
    const publishedPrimary = published!.snapshot!.tabs.find((t) => t.isPrimary)!;
    expect(textOf(publishedPrimary.blocks)).toEqual(['Publicado']);
    expect(db.select().from(revisions).all()).toHaveLength(1);
  });

  it('sem divergência devolve o mesmo conteúdo do publicado (não é erro)', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: paragraph('Igual') });
    await caller.pages.publish({ pageId });

    const preview = await caller.pages.getDraftPreview({ pageId });
    const published = await caller.pages.getPublishedBySlug({
      sectionSlug: 'componentes',
      pageSlug: 'button',
    });
    expect(preview.snapshot).toEqual(published!.snapshot);
  });

  it('página nunca publicada e sem blocos devolve snapshot vazio, não erro', async () => {
    const caller = callerFor(db, editor);
    const preview = await caller.pages.getDraftPreview({ pageId });

    expect(preview.titulo).toBe('Button');
    expect(preview.snapshot.tabs).toHaveLength(1);
    expect(preview.snapshot.tabs[0]!.isPrimary).toBe(true);
    expect(preview.snapshot.tabs[0]!.blocks).toEqual([]);
  });

  it('inclui todas as tabs, primária primeiro, no formato do renderer público', async () => {
    const caller = callerFor(db, editor);
    const usageTabId = (await caller.tabs.create({ pageId, titulo: 'Usage' })).id;
    await caller.blocks.saveDraft({ tabId: primaryTabId, doc: paragraph('Corpo') });
    await caller.blocks.saveDraft({ tabId: usageTabId, doc: paragraph('Uso') });

    const preview = await caller.pages.getDraftPreview({ pageId });
    expect(preview.snapshot.tabs.map((t) => t.tabId)).toEqual([primaryTabId, usageTabId]);
    expect(preview.snapshot.tabs[1]!.titulo).toBe('Usage');
    expect(preview.snapshot.tabs[0]!.blocks[0]).toMatchObject({ tabId: primaryTabId, type: 'paragraph' });
  });

  it('página inexistente dá NOT_FOUND', async () => {
    const caller = callerFor(db, editor);
    await expect(caller.pages.getDraftPreview({ pageId: 'nao-existe' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('não autenticado recebe UNAUTHORIZED — conteúdo não publicado não vaza', async () => {
    const caller = callerFor(db, null);
    await expect(caller.pages.getDraftPreview({ pageId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
