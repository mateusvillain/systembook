import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { DEFAULT_STATUS_TAGS, ensureDefaultStatusTags } from '../db/statusTags.js';
import { memberships, pages, sections, statusTags, users } from '../db/schema.js';
import { DEFAULT_MENU_ID } from '../db/schema.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

describe('tags de status (TASK-105)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-status-tags-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    const user = db
      .insert(users)
      .values({ nome: 'Editor', email: 'editor@test.local', senhaHash: 'irrelevante' })
      .returning({ id: users.id })
      .get();
    db.insert(memberships).values({ userId: user.id, role: 'editor' }).run();
    editor = { userId: user.id, role: 'editor', sessionId: 'fake-session' };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('seed padrão (ensureDefaultStatusTags)', () => {
    it('cria exatamente as quatro tags padrão, na ordem, e é idempotente', () => {
      ensureDefaultStatusTags(db);
      ensureDefaultStatusTags(db); // segunda execução não duplica

      const rows = db.select().from(statusTags).orderBy(statusTags.ordem).all();
      expect(rows.map((r) => r.titulo)).toEqual(['To do', 'In progress', 'Deprecated', 'Beta']);
      expect(rows).toHaveLength(DEFAULT_STATUS_TAGS.length);
      // cada uma tem um hex válido
      for (const r of rows) expect(r.cor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('respeita edições do usuário no re-seed (não sobrescreve)', () => {
      ensureDefaultStatusTags(db);
      db.update(statusTags)
        .set({ titulo: 'A fazer', cor: '#000000' })
        .where(eq(statusTags.id, '__sb_status_todo__'))
        .run();

      ensureDefaultStatusTags(db);

      const todo = db.select().from(statusTags).where(eq(statusTags.id, '__sb_status_todo__')).get();
      expect(todo).toMatchObject({ titulo: 'A fazer', cor: '#000000' });
    });
  });

  describe('CRUD via router', () => {
    it('create atribui ordem incremental e list retorna ordenado', async () => {
      const caller = callerFor(db, editor);
      const a = await caller.statusTags.create({ titulo: 'Rascunho', cor: '#111111' });
      const b = await caller.statusTags.create({ titulo: 'Revisão', cor: '#222222' });
      expect(a.ordem).toBe(0);
      expect(b.ordem).toBe(1);
      expect((await caller.statusTags.list()).map((t) => t.titulo)).toEqual(['Rascunho', 'Revisão']);
    });

    it('update renomeia e recolore; NOT_FOUND para id ausente', async () => {
      const caller = callerFor(db, editor);
      const tag = await caller.statusTags.create({ titulo: 'Rascunho', cor: '#111111' });

      await expect(
        caller.statusTags.update({ id: tag.id, titulo: 'Draft', cor: '#abcdef' }),
      ).resolves.toMatchObject({ titulo: 'Draft', cor: '#abcdef' });
      // só a cor
      await expect(caller.statusTags.update({ id: tag.id, cor: '#000000' })).resolves.toMatchObject({
        titulo: 'Draft',
        cor: '#000000',
      });
      await expect(caller.statusTags.update({ id: 'ausente', titulo: 'X' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejeita cor fora do formato hex e update vazio', async () => {
      const caller = callerFor(db, editor);
      await expect(caller.statusTags.create({ titulo: 'X', cor: 'vermelho' })).rejects.toBeDefined();
      const tag = await caller.statusTags.create({ titulo: 'X', cor: '#123456' });
      await expect(caller.statusTags.update({ id: tag.id })).rejects.toBeDefined();
    });

    it('reordena somente com a lista completa', async () => {
      const caller = callerFor(db, editor);
      const a = await caller.statusTags.create({ titulo: 'A', cor: '#111111' });
      const b = await caller.statusTags.create({ titulo: 'B', cor: '#222222' });
      const c = await caller.statusTags.create({ titulo: 'C', cor: '#333333' });

      await caller.statusTags.reorder({ orderedIds: [c.id, a.id, b.id] });
      expect((await caller.statusTags.list()).map((t) => t.id)).toEqual([c.id, a.id, b.id]);
      await expect(caller.statusTags.reorder({ orderedIds: [a.id] })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('deletar uma tag em uso zera o statusTagId das páginas (ON DELETE SET NULL)', async () => {
      const caller = callerFor(db, editor);
      const tag = await caller.statusTags.create({ titulo: 'Beta', cor: '#9333ea' });

      const section = db
        .insert(sections)
        .values({ menuId: DEFAULT_MENU_ID, titulo: 'S', slug: 's-status', ordem: 0 })
        .returning()
        .get();
      const page = db
        .insert(pages)
        .values({ sectionId: section.id, titulo: 'P', slug: 'p', ordem: 0, statusTagId: tag.id })
        .returning()
        .get();

      await expect(caller.statusTags.delete({ id: tag.id })).resolves.toEqual({ ok: true });

      const after = db.select().from(pages).where(eq(pages.id, page.id)).get();
      expect(after?.statusTagId).toBeNull();
      await expect(caller.statusTags.delete({ id: 'ausente' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  it('bloqueia acesso não autenticado', async () => {
    const anon = callerFor(db, null);
    await expect(anon.statusTags.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(anon.statusTags.create({ titulo: 'X', cor: '#111111' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
