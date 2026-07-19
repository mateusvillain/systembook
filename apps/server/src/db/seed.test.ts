import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { count, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { runMigrations } from './migrate.js';
import { seedBootstrapAdmin } from './seed.js';
import { memberships, users } from './schema.js';
import { appRouter } from '../trpc/router.js';

const TEST_EMAIL = 'admin-test@example.com';

describe('migração + seed de bootstrap', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-test-'));
    process.env.INITIAL_ADMIN_EMAIL = TEST_EMAIL;
    process.env.INITIAL_ADMIN_PASSWORD = 'senha-de-teste-nao-real';
    process.env.ARGON2_SECRET = 'pepper-de-teste';
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('cria exatamente um admin em banco vazio, com hash argon2id', async () => {
    const { created } = await seedBootstrapAdmin(db);
    expect(created).toBe(true);

    const user = db.select().from(users).where(eq(users.email, TEST_EMAIL)).get();
    expect(user).toBeDefined();
    expect(user?.senhaHash).toMatch(/^\$argon2id\$/);
    expect(user?.senhaHash).not.toContain('senha-de-teste-nao-real');

    const membership = db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, user!.id))
      .get();
    expect(membership?.role).toBe('admin');
  });

  it('é idempotente — segunda execução não duplica', async () => {
    await seedBootstrapAdmin(db);
    const second = await seedBootstrapAdmin(db);
    expect(second.created).toBe(false);

    const row = db.select({ total: count() }).from(users).get();
    expect(row?.total).toBe(1);
  });

  it('health.check responde ok com o banco acessível', async () => {
    const caller = appRouter.createCaller({ db, res: null, user: null });
    await expect(caller.health.check()).resolves.toEqual({ status: 'ok', db: 'ok' });
  });
});
