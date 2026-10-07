import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TokenSet } from '@systembook/schema';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { tokenSets } from '../db/schema.js';
import { insertTokenSet } from '../db/tokenSets.js';
import { appRouter } from './router.js';

const anon = (db: Db) => appRouter.createCaller({ db, res: null as unknown as ServerResponse, user: null });

const tokenSetWith = (brand: string): TokenSet => ({
  modes: ['default'],
  tokens: [{ path: 'color.brand', type: 'color', byMode: { default: { value: brand, resolvedValue: brand } } }],
});

describe('tokens.getLatest (SYS-143)', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-tokens-trpc-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('sem sessão e sem upload: null', async () => {
    expect(await anon(db).tokens.getLatest()).toBeNull();
  });

  it('sem sessão: o último conjunto publicado', async () => {
    insertTokenSet(db, { commitSha: 'a', tokenSet: tokenSetWith('#111'), publicadoEm: new Date('2026-10-07T10:00:00Z') });
    insertTokenSet(db, { commitSha: 'b', tokenSet: tokenSetWith('#222'), publicadoEm: new Date('2026-10-07T11:00:00Z') });
    expect(await anon(db).tokens.getLatest()).toEqual(tokenSetWith('#222'));
  });

  it('o último upload sem tokens vale como "sem tokens", não lista vazia', async () => {
    insertTokenSet(db, { commitSha: 'a', tokenSet: tokenSetWith('#111'), publicadoEm: new Date('2026-10-07T10:00:00Z') });
    insertTokenSet(db, { commitSha: 'b', tokenSet: { modes: ['default'], tokens: [] }, publicadoEm: new Date('2026-10-07T11:00:00Z') });
    expect(await anon(db).tokens.getLatest()).toBeNull();
  });

  it('linha ilegível vira erro da query (a doc mostra o aviso de erro)', async () => {
    db.insert(tokenSets).values({ commitSha: 'x', conteudoJson: '{quebrado' }).run();
    await expect(anon(db).tokens.getLatest()).rejects.toThrow();
  });
});
