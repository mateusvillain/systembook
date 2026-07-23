import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { and, eq } from 'drizzle-orm';
import { DEFAULT_MENU_ID, memberships, tabs, users } from '../db/schema.js';
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
    const section = await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'Componentes' });
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

  it('indexa o conteúdo do corpo da página (tab primária), não só o das tabs (TASK-66)', async () => {
    const caller = callerFor(db, editor);
    // Escreve no corpo da página (tab primária), sem tocar na tab 'Usage'.
    const primary = db
      .select({ id: tabs.id })
      .from(tabs)
      .where(and(eq(tabs.pageId, pageId), eq(tabs.isPrimary, true)))
      .get();
    await caller.blocks.saveDraft({
      tabId: primary!.id,
      doc: paragraph('texto exclusivo do corpo: xilofagia'),
    });
    await caller.pages.publish({ pageId });

    const results = await caller.search.query({ q: 'xilofagia' });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ pageId, pageSlug: 'button' });
  });

  it('indexa título e descrição de um bloco dos-donts (TASK-71)', async () => {
    const caller = callerFor(db, editor);
    const doc: TiptapDoc = {
      type: 'doc',
      content: [
        {
          type: 'dosDonts',
          attrs: { variant: 'do', titulo: 'Use hierarquia visual zurbagante', cover: null },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'texto quixotesco da descrição' }] }],
        },
      ],
    };
    await caller.blocks.saveDraft({ tabId, doc });
    await caller.pages.publish({ pageId });

    expect(await caller.search.query({ q: 'zurbagante' })).toHaveLength(1); // título
    expect(await caller.search.query({ q: 'quixotesco' })).toHaveLength(1); // descrição
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

describe('search.structure (TASK-91) — títulos da navegação, incl. rascunhos', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let menuId: string;
  let sectionId: string;
  let pageId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-structsearch-'));
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
    menuId = (await caller.menus.create({ titulo: 'Fundamentos' })).id;
    sectionId = (await caller.sections.create({ menuId, titulo: 'Cores da marca' })).id;
    pageId = (await caller.pages.create({ sectionId, titulo: 'Paleta primária', slug: 'paleta' })).id;
    await caller.tabs.create({ pageId, titulo: 'Acessibilidade' });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('casa páginas NÃO publicadas por título (o que a busca de conteúdo não faz)', async () => {
    const caller = callerFor(db, editor);
    // A página nunca foi publicada → search.query não a encontra…
    expect(await caller.search.query({ q: 'paleta' })).toEqual([]);
    // …mas a busca de estrutura sim, com o alvo de navegação do editor.
    const results = await caller.search.structure({ q: 'paleta' });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: 'page', id: pageId, pageId, menuId, context: 'Cores da marca' });
  });

  it('casa menus, seções e tabs de usuário por título, com o menu dono', async () => {
    const caller = callerFor(db, editor);

    const menuHit = await caller.search.structure({ q: 'fundamentos' });
    expect(menuHit).toEqual([expect.objectContaining({ type: 'menu', id: menuId, menuId })]);

    const sectionHit = await caller.search.structure({ q: 'cores' });
    expect(sectionHit).toEqual([expect.objectContaining({ type: 'section', id: sectionId, menuId })]);

    const tabHit = await caller.search.structure({ q: 'acessibilidade' });
    expect(tabHit).toEqual([
      expect.objectContaining({ type: 'tab', menuId, pageId, context: 'Paleta primária' }),
    ]);
    expect(tabHit[0]?.tabId).toBeTruthy();
  });

  it('não vaza a tab primária (corpo) nem a estrutura reservada da landing', async () => {
    const caller = callerFor(db, editor);
    // A tab primária se chama "Conteúdo" — não deve aparecer como aba de usuário.
    expect(await caller.search.structure({ q: 'conteúdo' })).toEqual([]);
    // A landing é "Página inicial" (tab)/reservada — fora da busca de estrutura.
    expect(await caller.search.structure({ q: 'página inicial' })).toEqual([]);
  });

  it('é case-insensitive (ASCII) e trata curingas do LIKE como texto literal', async () => {
    const caller = callerFor(db, editor);
    expect(await caller.search.structure({ q: 'PALETA' })).toHaveLength(1);
    // '%' é um curinga do LIKE; deve casar literalmente (nenhuma página tem '%').
    expect(await caller.search.structure({ q: '%' })).toEqual([]);
  });

  it('exige autenticação (protectedProcedure, ao contrário de search.query)', async () => {
    const anon = callerFor(db, null);
    await expect(anon.search.structure({ q: 'paleta' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
