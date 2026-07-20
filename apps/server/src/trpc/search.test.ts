import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, users } from '../db/schema.js';
import type { TiptapDoc } from '../blocks/serialize.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

function paragraph(text: string): TiptapDoc {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

describe('search.query (TASK-53) — FTS5 full-text', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let pageId: string;
  let tabId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-search-'));
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
    pageId = (await caller.pages.create({ sectionId: section.id, titulo: 'Button', slug: 'button' }))
      .id;
    tabId = (await caller.tabs.create({ pageId, titulo: 'Usage' })).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('encontra uma página publicada por texto distintivo, com snippet destacado', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({
      tabId,
      doc: paragraph('O componente Zephyrantes tem estados de foco acessíveis'),
    });
    await caller.pages.publish({ pageId });

    const results = await caller.search.query({ q: 'zephyrantes' });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      pageId,
      pageTitulo: 'Button',
      pageSlug: 'button',
      sectionTitulo: 'Componentes',
    });
    expect(results[0]?.sectionSlug).toBeTruthy();
    // Termo casado delimitado por STX/ETX (não HTML — ver SearchResult.snippet).
    expect(results[0]?.snippet).toContain('Zephyrantes');
  });

  it('também casa por título da página e da seção', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: paragraph('conteúdo qualquer') });
    await caller.pages.publish({ pageId });

    expect(await caller.search.query({ q: 'button' })).toHaveLength(1);
    expect(await caller.search.query({ q: 'componentes' })).toHaveLength(1);
  });

  it('exclui páginas nunca publicadas (sem revisão) dos resultados', async () => {
    const caller = callerFor(db, editor);
    // Rascunho salvo mas nunca publicado — não deve indexar.
    await caller.blocks.saveDraft({ tabId, doc: paragraph('rascunho invisível supersecreto') });

    expect(await caller.search.query({ q: 'supersecreto' })).toEqual([]);
  });

  it('restaurar uma revisão antiga reindexa: a busca reflete o conteúdo restaurado', async () => {
    const caller = callerFor(db, editor);

    await caller.blocks.saveDraft({ tabId, doc: paragraph('texto alfacaralho original') });
    const r1 = await caller.pages.publish({ pageId });

    await caller.blocks.saveDraft({ tabId, doc: paragraph('texto betacaralho substituto') });
    await caller.pages.publish({ pageId });

    // Após v2, só o novo termo casa.
    expect(await caller.search.query({ q: 'betacaralho' })).toHaveLength(1);
    expect(await caller.search.query({ q: 'alfacaralho' })).toEqual([]);

    // Restaura v1 → índice volta ao conteúdo original.
    await caller.pages.restoreRevision({ pageId, revisionId: r1.id });

    expect(await caller.search.query({ q: 'alfacaralho' })).toHaveLength(1);
    expect(await caller.search.query({ q: 'betacaralho' })).toEqual([]);
  });

  it('q em branco (só símbolos) devolve lista vazia sem erro de sintaxe FTS5', async () => {
    const caller = callerFor(db, editor);
    await caller.blocks.saveDraft({ tabId, doc: paragraph('algo publicado') });
    await caller.pages.publish({ pageId });

    // Caracteres que quebrariam a sintaxe MATCH crua não devem lançar.
    expect(await caller.search.query({ q: '"(' })).toEqual([]);
    expect(await caller.search.query({ q: 'AND OR' })).toHaveLength(0);
  });
});
