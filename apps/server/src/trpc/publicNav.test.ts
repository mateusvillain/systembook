import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { backfillSectionSlugs, generateUniqueSectionSlug } from '../db/sections.js';
import { memberships, sections, users } from '../db/schema.js';
import type { TiptapDoc } from '../blocks/serialize.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

const DOC: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Conteúdo' }] }],
};

describe('navegação pública (TASK-52)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-public-nav-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    const user = db
      .insert(users)
      .values({ nome: 'editor', email: 'editor@test.local', senhaHash: 'x' })
      .returning({ id: users.id })
      .get();
    db.insert(memberships).values({ userId: user.id, role: 'editor' }).run();
    editor = { userId: user.id, role: 'editor', sessionId: 's' };
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('create gera slug estável do título e desambigua colisões', async () => {
    const caller = callerFor(db, editor);
    const a = await caller.sections.create({ titulo: 'Componentes de UI' });
    const b = await caller.sections.create({ titulo: 'Componentes de UI' });
    expect(a.slug).toBe('componentes-de-ui');
    expect(b.slug).toBe('componentes-de-ui-2');
  });

  it('listPublic (anônimo) mostra só seções com página publicada, aninhadas', async () => {
    const caller = callerFor(db, editor);
    const sec = await caller.sections.create({ titulo: 'Botões' });
    // página publicada
    const pubPage = await caller.pages.create({ sectionId: sec.id, titulo: 'Primary', slug: 'primary' });
    const tab = await caller.tabs.create({ pageId: pubPage.id, titulo: 'Uso' });
    await caller.blocks.saveDraft({ tabId: tab.id, doc: DOC });
    await caller.pages.publish({ pageId: pubPage.id });
    // página NÃO publicada (não deve aparecer)
    await caller.pages.create({ sectionId: sec.id, titulo: 'Rascunho', slug: 'rascunho' });
    // seção vazia (sem página publicada) — não deve aparecer
    await caller.sections.create({ titulo: 'Vazia' });

    const anon = callerFor(db, null);
    const tree = await anon.sections.listPublic();
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ titulo: 'Botões', slug: 'botoes' });
    expect(tree[0]!.pages.map((p) => p.slug)).toEqual(['primary']);
  });

  it('getPublishedBySlug (anônimo) resolve o snapshot; null para inexistente', async () => {
    const caller = callerFor(db, editor);
    const sec = await caller.sections.create({ titulo: 'Botões' });
    const page = await caller.pages.create({ sectionId: sec.id, titulo: 'Primary', slug: 'primary' });
    const tab = await caller.tabs.create({ pageId: page.id, titulo: 'Uso' });
    await caller.blocks.saveDraft({ tabId: tab.id, doc: DOC });
    await caller.pages.publish({ pageId: page.id });

    const anon = callerFor(db, null);
    const resolved = await anon.pages.getPublishedBySlug({ sectionSlug: 'botoes', pageSlug: 'primary' });
    expect(resolved?.titulo).toBe('Primary');
    // tabs[0] é a primária (corpo, vazio); o conteúdo está na tab de usuário
    expect(resolved?.snapshot?.tabs.find((t) => t.tabId === tab.id)?.blocks[0]).toMatchObject({
      type: 'paragraph',
    });

    expect(
      await anon.pages.getPublishedBySlug({ sectionSlug: 'botoes', pageSlug: 'nope' }),
    ).toBeNull();
  });

  it('getPublishedBySlug retorna snapshot null para página nunca publicada', async () => {
    const caller = callerFor(db, editor);
    const sec = await caller.sections.create({ titulo: 'Botões' });
    await caller.pages.create({ sectionId: sec.id, titulo: 'Rascunho', slug: 'rascunho' });

    const anon = callerFor(db, null);
    const resolved = await anon.pages.getPublishedBySlug({ sectionSlug: 'botoes', pageSlug: 'rascunho' });
    expect(resolved).not.toBeNull();
    expect(resolved!.snapshot).toBeNull();
  });

  it('backfillSectionSlugs preenche slugs nulos de forma idempotente', () => {
    // insere seções sem slug (simula linhas pré-migration 0008)
    db.insert(sections).values({ titulo: 'Antiga A', ordem: 0 }).run();
    db.insert(sections).values({ titulo: 'Antiga A', ordem: 1 }).run();

    expect(backfillSectionSlugs(db).filled).toBe(2);
    const slugs = db.select({ slug: sections.slug }).from(sections).all().map((r) => r.slug);
    expect(new Set(slugs)).toEqual(new Set(['antiga-a', 'antiga-a-2']));
    // segunda passada não muda nada
    expect(backfillSectionSlugs(db).filled).toBe(0);
  });

  it('slugify base é determinística e sem acentos', () => {
    expect(generateUniqueSectionSlug(db, 'Ações & Botões!')).toBe('acoes-botoes');
  });
});
