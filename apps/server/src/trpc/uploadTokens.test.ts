import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findActiveUploadToken,
  generateUploadToken,
  hashUploadToken,
} from '../auth/uploadTokens.js';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, uploadTokens, users } from '../db/schema.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

describe('uploadTokens (TASK-44)', () => {
  let dir: string;
  let db: Db;
  let admin: AuthUser;
  let editor: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-tokens-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);

    for (const role of ['admin', 'editor'] as const) {
      const user = db
        .insert(users)
        .values({ nome: role, email: `${role}@test.local`, senhaHash: 'irrelevante' })
        .returning({ id: users.id })
        .get();
      db.insert(memberships).values({ userId: user.id, role }).run();
      const authUser = { userId: user.id, role, sessionId: 'fake-session' };
      if (role === 'admin') admin = authUser;
      else editor = authUser;
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('create devolve o token em claro uma única vez e persiste só o hash', async () => {
    const caller = callerFor(db, admin);
    const created = await caller.uploadTokens.create({ label: 'CI do design system' });

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(created.label).toBe('CI do design system');

    const row = db.select().from(uploadTokens).get()!;
    expect(row.tokenHash).toBe(hashUploadToken(created.token));
    expect(row.tokenHash).not.toBe(created.token);
    expect(row.revogadoEm).toBeNull();

    // list nunca expõe token nem hash
    const listed = await caller.uploadTokens.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('token');
    expect(listed[0]).not.toHaveProperty('tokenHash');
    expect(listed[0]?.label).toBe('CI do design system');
    expect(listed[0]?.revogadoEm).toBeNull();
  });

  it('findActiveUploadToken valida token bruto e rejeita desconhecido/revogado', async () => {
    const caller = callerFor(db, admin);
    const { id, token } = await caller.uploadTokens.create({ label: 'CI' });

    expect(findActiveUploadToken(db, token)?.id).toBe(id);
    expect(findActiveUploadToken(db, generateUploadToken())).toBeNull();

    await caller.uploadTokens.revoke({ tokenId: id });
    expect(findActiveUploadToken(db, token)).toBeNull();

    const listed = await caller.uploadTokens.list();
    expect(listed[0]?.revogadoEm).toBeInstanceOf(Date);
  });

  it('revoke é idempotente e mantém o timestamp original', async () => {
    const caller = callerFor(db, admin);
    const { id } = await caller.uploadTokens.create({ label: 'CI' });

    const first = await caller.uploadTokens.revoke({ tokenId: id });
    const second = await caller.uploadTokens.revoke({ tokenId: id });
    expect(second.revogadoEm).toEqual(first.revogadoEm);
  });

  it('revoke de id inexistente é NOT_FOUND', async () => {
    const caller = callerFor(db, admin);
    await expect(caller.uploadTokens.revoke({ tokenId: 'nao-existe' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('editor não acessa nenhuma procedure de tokens (FORBIDDEN)', async () => {
    const caller = callerFor(db, editor);
    await expect(caller.uploadTokens.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.uploadTokens.create({ label: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(caller.uploadTokens.revoke({ tokenId: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('não autenticado é UNAUTHORIZED', async () => {
    const caller = callerFor(db, null);
    await expect(caller.uploadTokens.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
