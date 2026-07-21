import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, pages, sections, tabs, users } from '../db/schema.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

describe('estrutura de navegação (sections/pages/tabs)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let admin: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-structure-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);

    // Os testes forjam o contexto direto (sem sessão HTTP); o fluxo de
    // login/cookie já é coberto por auth.test.ts.
    for (const role of ['admin', 'editor'] as const) {
      const user = db
        .insert(users)
        .values({ nome: role, email: `${role}@test.local`, senhaHash: 'irrelevante' })
        .returning({ id: users.id })
        .get();
      db.insert(memberships).values({ userId: user.id, role }).run();
      const authUser: AuthUser = { userId: user.id, role, sessionId: 'fake-session' };
      if (role === 'admin') admin = authUser;
      else editor = authUser;
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('sections (TASK-17/18)', () => {
    it('create atribui ordem incremental e list retorna ordenado', async () => {
      const caller = callerFor(db, editor);
      const a = await caller.sections.create({ titulo: 'Fundamentos' });
      const b = await caller.sections.create({ titulo: 'Componentes' });
      expect(a.ordem).toBe(0);
      expect(b.ordem).toBe(1);

      const list = await caller.sections.list();
      expect(list.map((s) => s.titulo)).toEqual(['Fundamentos', 'Componentes']);
    });

    it('rename atualiza o título e falha com NOT_FOUND para id inexistente', async () => {
      const caller = callerFor(db, editor);
      const section = await caller.sections.create({ titulo: 'Fundações' });
      const renamed = await caller.sections.rename({ id: section.id, titulo: 'Fundamentos' });
      expect(renamed.titulo).toBe('Fundamentos');

      await expect(caller.sections.rename({ id: 'nao-existe', titulo: 'X' })).rejects.toMatchObject(
        { code: 'NOT_FOUND' },
      );
    });

    it('reorder aplica a nova ordem atomicamente', async () => {
      const caller = callerFor(db, editor);
      const a = await caller.sections.create({ titulo: 'A' });
      const b = await caller.sections.create({ titulo: 'B' });
      const c = await caller.sections.create({ titulo: 'C' });

      await caller.sections.reorder({ orderedIds: [c.id, a.id, b.id] });
      const list = await caller.sections.list();
      expect(list.map((s) => s.titulo)).toEqual(['C', 'A', 'B']);
      expect(list.map((s) => s.ordem)).toEqual([0, 1, 2]);
    });

    it('reorder rejeita lista parcial, com id estranho ou repetido', async () => {
      const caller = callerFor(db, editor);
      const a = await caller.sections.create({ titulo: 'A' });
      const b = await caller.sections.create({ titulo: 'B' });

      await expect(caller.sections.reorder({ orderedIds: [a.id] })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      await expect(
        caller.sections.reorder({ orderedIds: [a.id, 'intruso'] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(caller.sections.reorder({ orderedIds: [a.id, a.id] })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      // nada mudou
      const list = await caller.sections.list();
      expect(list.map((s) => s.id)).toEqual([a.id, b.id]);
    });

    it('delete remove a seção e cascateia para pages e tabs', async () => {
      const caller = callerFor(db, editor);
      const section = await caller.sections.create({ titulo: 'Componentes' });
      const page = await caller.pages.create({
        sectionId: section.id,
        titulo: 'Button',
        slug: 'button',
      });
      await caller.tabs.create({ pageId: page.id, titulo: 'Usage' });

      await caller.sections.delete({ id: section.id });

      expect(db.select().from(sections).all()).toHaveLength(0);
      expect(db.select().from(pages).all()).toHaveLength(0);
      expect(db.select().from(tabs).all()).toHaveLength(0);
    });

    it('rejeita chamadas não autenticadas com UNAUTHORIZED; admin e editor passam', async () => {
      await expect(callerFor(db, null).sections.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
      await expect(
        callerFor(db, null).sections.create({ titulo: 'X' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      await expect(callerFor(db, admin).sections.create({ titulo: 'Via admin' })).resolves.toBeDefined();
      await expect(callerFor(db, editor).sections.create({ titulo: 'Via editor' })).resolves.toBeDefined();
    });
  });

  describe('pages (TASK-19/20)', () => {
    let sectionId: string;

    beforeEach(async () => {
      sectionId = (await callerFor(db, editor).sections.create({ titulo: 'Componentes' })).id;
    });

    it('create valida formato do slug', async () => {
      const caller = callerFor(db, editor);
      for (const slug of ['Com Espaço', 'Maiusculo', 'trailing-', '-leading', 'a--b', '']) {
        await expect(
          caller.pages.create({ sectionId, titulo: 'X', slug }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      }
      const ok = await caller.pages.create({ sectionId, titulo: 'Button', slug: 'button-2' });
      expect(ok.slug).toBe('button-2');
    });

    it('create já nasce com exatamente uma tab primária (corpo) e zero tabs de usuário (TASK-66)', async () => {
      const caller = callerFor(db, editor);
      const page = await caller.pages.create({ sectionId, titulo: 'Get started', slug: 'get-started' });

      const allTabs = db.select().from(tabs).where(eq(tabs.pageId, page.id)).all();
      expect(allTabs).toHaveLength(1);
      expect(allTabs[0]?.isPrimary).toBe(true);

      // a primária não aparece na listagem de tabs de usuário
      expect(await caller.tabs.listByPage({ pageId: page.id })).toHaveLength(0);

      const primaries = db
        .select()
        .from(tabs)
        .where(and(eq(tabs.pageId, page.id), eq(tabs.isPrimary, true)))
        .all();
      expect(primaries).toHaveLength(1);
    });

    it('a tab primária não é renomeável nem removível como tab de usuário (TASK-66)', async () => {
      const caller = callerFor(db, editor);
      const page = await caller.pages.create({ sectionId, titulo: 'Body', slug: 'body' });
      const primary = db
        .select()
        .from(tabs)
        .where(and(eq(tabs.pageId, page.id), eq(tabs.isPrimary, true)))
        .get();

      await expect(caller.tabs.rename({ id: primary!.id, titulo: 'Hack' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(caller.tabs.delete({ id: primary!.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      // segue existindo e intacta
      const still = db.select().from(tabs).where(eq(tabs.id, primary!.id)).get();
      expect(still?.isPrimary).toBe(true);
    });

    it('slug duplicado na mesma seção dá CONFLICT; em seção diferente funciona', async () => {
      const caller = callerFor(db, editor);
      await caller.pages.create({ sectionId, titulo: 'Overview', slug: 'overview' });
      await expect(
        caller.pages.create({ sectionId, titulo: 'Outra', slug: 'overview' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      const outraSection = await caller.sections.create({ titulo: 'Padrões' });
      await expect(
        caller.pages.create({ sectionId: outraSection.id, titulo: 'Overview', slug: 'overview' }),
      ).resolves.toMatchObject({ slug: 'overview' });
    });

    it('create em seção inexistente dá NOT_FOUND', async () => {
      await expect(
        callerFor(db, editor).pages.create({ sectionId: 'nao-existe', titulo: 'X', slug: 'x' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rename só muda titulo; updateSlug valida unicidade na seção', async () => {
      const caller = callerFor(db, editor);
      const page = await caller.pages.create({ sectionId, titulo: 'Botao', slug: 'botao' });
      const other = await caller.pages.create({ sectionId, titulo: 'Input', slug: 'input' });

      const renamed = await caller.pages.rename({ id: page.id, titulo: 'Button' });
      expect(renamed).toMatchObject({ titulo: 'Button', slug: 'botao' });

      await expect(
        caller.pages.updateSlug({ id: other.id, slug: 'botao' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(caller.pages.updateSlug({ id: other.id, slug: 'text-input' })).resolves.toMatchObject(
        { slug: 'text-input' },
      );
    });

    it('reorder é escopado à seção e listBySection respeita a ordem', async () => {
      const caller = callerFor(db, editor);
      const a = await caller.pages.create({ sectionId, titulo: 'A', slug: 'a' });
      const b = await caller.pages.create({ sectionId, titulo: 'B', slug: 'b' });
      const outra = await caller.sections.create({ titulo: 'Outra' });
      const c = await caller.pages.create({ sectionId: outra.id, titulo: 'C', slug: 'c' });

      await caller.pages.reorder({ sectionId, orderedIds: [b.id, a.id] });

      const list = await caller.pages.listBySection({ sectionId });
      expect(list.map((p) => p.titulo)).toEqual(['B', 'A']);
      // página de outra seção não foi tocada
      expect((await caller.pages.listBySection({ sectionId: outra.id }))[0]!.id).toBe(c.id);

      // lista com página de outra seção é rejeitada
      await expect(
        caller.pages.reorder({ sectionId, orderedIds: [b.id, c.id] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('delete cascateia para as tabs da página', async () => {
      const caller = callerFor(db, editor);
      const page = await caller.pages.create({ sectionId, titulo: 'Button', slug: 'button' });
      await caller.tabs.create({ pageId: page.id, titulo: 'Usage' });

      await caller.pages.delete({ id: page.id });
      expect(db.select().from(tabs).all()).toHaveLength(0);
    });
  });

  describe('tabs (TASK-21/22)', () => {
    let pageId: string;

    beforeEach(async () => {
      const caller = callerFor(db, editor);
      const section = await caller.sections.create({ titulo: 'Componentes' });
      pageId = (await caller.pages.create({ sectionId: section.id, titulo: 'Button', slug: 'button' })).id;
    });

    it('create atribui ordem por página e aceita títulos repetidos (MVP)', async () => {
      const caller = callerFor(db, editor);
      const usage = await caller.tabs.create({ pageId, titulo: 'Usage' });
      const code = await caller.tabs.create({ pageId, titulo: 'Code' });
      const duplicada = await caller.tabs.create({ pageId, titulo: 'Usage' });
      expect([usage.ordem, code.ordem, duplicada.ordem]).toEqual([0, 1, 2]);

      const list = await caller.tabs.listByPage({ pageId });
      expect(list.map((t) => t.titulo)).toEqual(['Usage', 'Code', 'Usage']);
    });

    it('create em página inexistente dá NOT_FOUND', async () => {
      await expect(
        callerFor(db, editor).tabs.create({ pageId: 'nao-existe', titulo: 'X' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rename e reorder escopado à página', async () => {
      const caller = callerFor(db, editor);
      const a = await caller.tabs.create({ pageId, titulo: 'Usage' });
      const b = await caller.tabs.create({ pageId, titulo: 'Code' });

      await caller.tabs.rename({ id: a.id, titulo: 'Uso' });
      await caller.tabs.reorder({ pageId, orderedIds: [b.id, a.id] });

      const list = await caller.tabs.listByPage({ pageId });
      expect(list.map((t) => t.titulo)).toEqual(['Code', 'Uso']);

      await expect(
        caller.tabs.reorder({ pageId, orderedIds: [a.id] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('delete remove a tab', async () => {
      const caller = callerFor(db, editor);
      const tab = await caller.tabs.create({ pageId, titulo: 'Usage' });
      await caller.tabs.delete({ id: tab.id });
      expect(await caller.tabs.listByPage({ pageId })).toHaveLength(0);

      await expect(caller.tabs.delete({ id: tab.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
