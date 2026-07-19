import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { count, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, sessions, users } from '../db/schema.js';
import { hashPassword, _resetPepperCacheForTests } from '../auth/password.js';
import { appRouter } from './router.js';
import { createContext, resolveUser, type AuthUser } from './context.js';

const ADMIN = { email: 'admin@test.local', password: 'senha-admin-123' };
const EDITOR = { email: 'editor@test.local', password: 'senha-editor-123' };

interface FakeRes {
  headers: Record<string, string | string[]>;
  setHeader(name: string, value: string | string[]): void;
}

function fakeRes(): FakeRes {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
  };
}

async function createUser(db: Db, email: string, password: string, role: 'admin' | 'editor') {
  const user = db
    .insert(users)
    .values({ nome: email.split('@')[0]!, email, senhaHash: await hashPassword(password) })
    .returning({ id: users.id })
    .get();
  db.insert(memberships).values({ userId: user.id, role }).run();
  return user.id;
}

function callerFor(db: Db, user: AuthUser | null, res: FakeRes = fakeRes()) {
  return appRouter.createCaller({ db, res: res as unknown as ServerResponse, user });
}

async function loginAs(db: Db, creds: { email: string; password: string }) {
  const res = fakeRes();
  const result = await callerFor(db, null, res).auth.login(creds);
  const cookie = String(res.headers['set-cookie']);
  const sessionId = /session_id=([^;]+)/.exec(cookie)![1]!;
  return { ...result, sessionId, cookie };
}

function authUser(db: Db, sessionId: string): AuthUser | null {
  return resolveUser(db, { headers: { cookie: `session_id=${sessionId}` } });
}

describe('auth + autorização', () => {
  let dir: string;
  let db: Db;
  let adminId: string;
  let editorId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-auth-'));
    process.env.ARGON2_SECRET = 'pepper-de-teste';
    _resetPepperCacheForTests();
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    adminId = await createUser(db, ADMIN.email, ADMIN.password, 'admin');
    editorId = await createUser(db, EDITOR.email, EDITOR.password, 'editor');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('auth.login (TASK-10)', () => {
    it('credenciais corretas criam sessão e setam cookie httpOnly', async () => {
      const res = fakeRes();
      const result = await callerFor(db, null, res).auth.login(ADMIN);

      expect(result).toEqual({ userId: adminId, role: 'admin' });
      expect(JSON.stringify(result)).not.toContain('senha');

      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('session_id=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');

      const row = db.select().from(sessions).where(eq(sessions.userId, adminId)).get();
      expect(row).toBeDefined();
      expect(row!.expiraEm.getTime()).toBeGreaterThan(Date.now());
    });

    it('email desconhecido e senha errada retornam o MESMO erro genérico', async () => {
      const wrongPassword = callerFor(db, null)
        .auth.login({ email: ADMIN.email, password: 'errada-12345' })
        .catch((e: TRPCError) => ({ code: e.code, message: e.message }));
      const unknownEmail = callerFor(db, null)
        .auth.login({ email: 'ninguem@test.local', password: 'qualquer-123' })
        .catch((e: TRPCError) => ({ code: e.code, message: e.message }));

      const [a, b] = await Promise.all([wrongPassword, unknownEmail]);
      expect(a).toEqual({ code: 'UNAUTHORIZED', message: 'Credenciais inválidas' });
      expect(b).toEqual(a);
    });

    it('re-hasheia hash legado scrypt para argon2id no login', async () => {
      const { randomBytes, scryptSync } = await import('node:crypto');
      const salt = randomBytes(16);
      const digest = scryptSync('senha-legada-123' + 'pepper-de-teste', salt, 64);
      const legacyHash = `scrypt$${salt.toString('base64')}$${digest.toString('base64')}`;
      db.update(users).set({ senhaHash: legacyHash }).where(eq(users.id, editorId)).run();

      await callerFor(db, null).auth.login({ email: EDITOR.email, password: 'senha-legada-123' });

      const updated = db.select().from(users).where(eq(users.id, editorId)).get();
      expect(updated!.senhaHash).toMatch(/^\$argon2id\$/);
    });
  });

  describe('middleware (TASK-11)', () => {
    it('sem cookie: protectedProcedure retorna UNAUTHORIZED', async () => {
      await expect(callerFor(db, null).auth.logout()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('editor em adminProcedure retorna FORBIDDEN', async () => {
      const { sessionId } = await loginAs(db, EDITOR);
      const user = authUser(db, sessionId);
      await expect(callerFor(db, user).users.list()).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('admin em adminProcedure funciona', async () => {
      const { sessionId } = await loginAs(db, ADMIN);
      const user = authUser(db, sessionId);
      const list = await callerFor(db, user).users.list();
      expect(list).toHaveLength(2);
    });

    it('sessão expirada vira não autenticado e a linha é removida', async () => {
      const { sessionId } = await loginAs(db, ADMIN);
      db.update(sessions)
        .set({ expiraEm: new Date(Date.now() - 1000) })
        .where(eq(sessions.id, sessionId))
        .run();

      expect(authUser(db, sessionId)).toBeNull();
      const gone = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
      expect(gone).toBeUndefined();
    });

    it('createContext monta user a partir do cookie da request', async () => {
      const { sessionId } = await loginAs(db, ADMIN);
      const ctx = createContext(db, { headers: { cookie: `session_id=${sessionId}` } }, null);
      expect(ctx.user).toMatchObject({ userId: adminId, role: 'admin', sessionId });
    });
  });

  describe('users CRUD (TASK-14)', () => {
    let admin: AuthUser;
    let editor: AuthUser;

    beforeEach(async () => {
      admin = authUser(db, (await loginAs(db, ADMIN)).sessionId)!;
      editor = authUser(db, (await loginAs(db, EDITOR)).sessionId)!;
    });

    it('list retorna usuários sem senha_hash', async () => {
      const list = await callerFor(db, admin).users.list();
      expect(list.map((u) => u.email).sort()).toEqual([ADMIN.email, EDITOR.email]);
      expect(JSON.stringify(list)).not.toContain('senha');
      expect(JSON.stringify(list)).not.toContain('argon2');
    });

    it('create cria user+membership e rejeita email duplicado com CONFLICT', async () => {
      const caller = callerFor(db, admin);
      const created = await caller.users.create({
        nome: 'Novo',
        email: 'novo@test.local',
        password: 'senha-nova-123',
        role: 'editor',
      });
      expect(created.role).toBe('editor');

      await expect(
        caller.users.create({
          nome: 'Duplicado',
          email: 'novo@test.local',
          password: 'outra-senha-123',
          role: 'editor',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('update troca o role', async () => {
      const updated = await callerFor(db, admin).users.update({
        userId: editorId,
        role: 'admin',
      });
      expect(updated).toEqual({ userId: editorId, role: 'admin' });
    });

    it('deactivate bloqueia a própria conta e remove outras', async () => {
      const caller = callerFor(db, admin);
      await expect(caller.users.deactivate({ userId: adminId })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });

      await caller.users.deactivate({ userId: editorId });
      const row = db.select({ total: count() }).from(users).get();
      expect(row?.total).toBe(1);
      // cascade: sessões e membership do editor sumiram
      expect(db.select().from(sessions).where(eq(sessions.userId, editorId)).all()).toHaveLength(0);
    });

    it('todas as mutations rejeitam editor com FORBIDDEN', async () => {
      const caller = callerFor(db, editor);
      await expect(caller.users.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        caller.users.create({
          nome: 'X',
          email: 'x@test.local',
          password: 'senha-x-123',
          role: 'editor',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        caller.users.update({ userId: adminId, role: 'editor' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(caller.users.deactivate({ userId: adminId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('users.resetPassword (TASK-15)', () => {
    it('troca a senha e invalida todas as sessões do usuário', async () => {
      const admin = authUser(db, (await loginAs(db, ADMIN)).sessionId)!;
      const { sessionId: editorSession } = await loginAs(db, EDITOR);

      await callerFor(db, admin).users.resetPassword({
        userId: editorId,
        newPassword: 'senha-trocada-456',
      });

      // sessão antiga invalidada
      expect(authUser(db, editorSession)).toBeNull();

      // senha antiga falha, nova funciona
      await expect(
        callerFor(db, null).auth.login({ email: EDITOR.email, password: EDITOR.password }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      const relogin = await callerFor(db, null).auth.login({
        email: EDITOR.email,
        password: 'senha-trocada-456',
      });
      expect(relogin.userId).toBe(editorId);
    });
  });

  describe('auth.logout (TASK-16)', () => {
    it('remove a sessão e limpa o cookie; sessão antiga deixa de autenticar', async () => {
      const { sessionId } = await loginAs(db, ADMIN);
      const user = authUser(db, sessionId)!;

      const res = fakeRes();
      await callerFor(db, user, res).auth.logout();

      expect(String(res.headers['set-cookie'])).toContain('Max-Age=0');
      expect(authUser(db, sessionId)).toBeNull();
      await expect(callerFor(db, authUser(db, sessionId)).auth.logout()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('auth.me', () => {
    it('retorna user autenticado ou null', async () => {
      const { sessionId } = await loginAs(db, ADMIN);
      const user = authUser(db, sessionId);
      await expect(callerFor(db, user).auth.me()).resolves.toEqual({
        userId: adminId,
        role: 'admin',
      });
      await expect(callerFor(db, null).auth.me()).resolves.toBeNull();
    });
  });
});
