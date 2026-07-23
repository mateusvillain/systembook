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

const USAGE_DOC: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Uso' }] }],
};

const CODE_DOC: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'codeBlock', attrs: { language: 'tsx' }, content: [{ type: 'text', text: '<Button />' }] }],
};

describe('pages.publish (TASK-34)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let pageId: string;
  let usageTabId: string;
  let codeTabId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-publish-'));
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
    usageTabId = (await caller.tabs.create({ pageId, titulo: 'Usage' })).id;
    codeTabId = (await caller.tabs.create({ pageId, titulo: 'Code' })).id;

    await caller.blocks.saveDraft({ tabId: usageTabId, doc: USAGE_DOC });
    await caller.blocks.saveDraft({ tabId: codeTabId, doc: CODE_DOC });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('cria uma revisão com o snapshot de todas as tabs/blocks atuais da página', async () => {
    const caller = callerFor(db, editor);
    const revision = await caller.pages.publish({ pageId, mensagem: 'Primeira versão' });

    expect(revision.pageId).toBe(pageId);
    expect(revision.mensagem).toBe('Primeira versão');
    expect(revision.autorId).toBe(editor.userId);

    const snapshot = JSON.parse(revision.snapshotJson) as {
      tabs: { tabId: string; titulo: string; isPrimary: boolean; blocks: { type: string }[] }[];
    };
    // tab primária (corpo) + as 2 tabs de usuário (TASK-66)
    expect(snapshot.tabs).toHaveLength(3);
    expect(snapshot.tabs.some((t) => t.isPrimary)).toBe(true);
    expect(snapshot.tabs.find((t) => t.tabId === usageTabId)?.blocks[0]?.type).toBe('paragraph');
    expect(snapshot.tabs.find((t) => t.tabId === codeTabId)?.blocks[0]?.type).toBe('code');
    expect(db.select().from(revisions).all()).toHaveLength(1);
  });

  it('autorId vem do contexto, não do client', async () => {
    const caller = callerFor(db, editor);
    const revision = await caller.pages.publish({
      pageId,
      // @ts-expect-error autorId não é um input válido — não deve ser aceito nem usado
      autorId: 'outro-usuario',
    });
    expect(revision.autorId).toBe(editor.userId);
  });

  it('mensagem é opcional', async () => {
    const caller = callerFor(db, editor);
    const revision = await caller.pages.publish({ pageId });
    expect(revision.mensagem).toBeNull();
  });

  it('página inexistente dá NOT_FOUND', async () => {
    const caller = callerFor(db, editor);
    await expect(caller.pages.publish({ pageId: 'nao-existe' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('não autenticado recebe UNAUTHORIZED', async () => {
    const caller = callerFor(db, null);
    await expect(caller.pages.publish({ pageId })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
