import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TokenSet } from '@systembook/schema';
import { createDb, type Db } from './client.js';
import { runMigrations } from './migrate.js';
import { getLatestTokenSet, insertTokenSet } from './tokenSets.js';

const set = (value: string): TokenSet => ({
  modes: ['light', 'dark'],
  tokens: [
    {
      path: 'color.brand',
      type: 'color',
      description: 'Ação principal.',
      byMode: {
        light: { value: '{color.palette.indigo}', resolvedValue: value, aliasOf: 'color.palette.indigo' },
        dark: { value, resolvedValue: value },
      },
    },
  ],
});

describe('token_sets (SYS-141)', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-tokens-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('sem nenhum upload, não há conjunto', () => {
    expect(getLatestTokenSet(db)).toBeNull();
  });

  it('append-only: as publicações coexistem e a mais recente vence, com o conjunto intacto', () => {
    const antiga = insertTokenSet(db, {
      commitSha: 'aaa111',
      tokenSet: set('#111111'),
      publicadoEm: new Date('2026-10-07T10:00:00Z'),
    });
    const recente = insertTokenSet(db, {
      commitSha: 'bbb222',
      tokenSet: set('#222222'),
      publicadoEm: new Date('2026-10-07T11:00:00Z'),
    });

    expect(antiga.id).not.toBe(recente.id);
    const latest = getLatestTokenSet(db);
    expect(latest).toEqual({
      id: recente.id,
      commitSha: 'bbb222',
      publicadoEm: new Date('2026-10-07T11:00:00Z'),
      tokenSet: set('#222222'),
    });
  });

  it('a ordem é a de publicação, não a de inserção', () => {
    insertTokenSet(db, { commitSha: 'novo', tokenSet: set('#2'), publicadoEm: new Date('2026-10-07T11:00:00Z') });
    insertTokenSet(db, { commitSha: 'velho', tokenSet: set('#1'), publicadoEm: new Date('2026-10-07T10:00:00Z') });
    expect(getLatestTokenSet(db)?.commitSha).toBe('novo');
  });

  it('empate de publicado_em (mesmo segundo) desempata pela inserção mais recente', () => {
    const mesmoInstante = new Date('2026-10-07T12:00:00Z');
    insertTokenSet(db, { commitSha: 'primeiro', tokenSet: set('#1'), publicadoEm: mesmoInstante });
    insertTokenSet(db, { commitSha: 'segundo', tokenSet: set('#2'), publicadoEm: mesmoInstante });
    expect(getLatestTokenSet(db)?.commitSha).toBe('segundo');
  });

  it('sem publicadoEm explícito, usa o agora do banco', () => {
    const antes = Math.floor(Date.now() / 1000);
    const row = insertTokenSet(db, { commitSha: 'agora', tokenSet: set('#3') });
    expect(row.publicadoEm.getTime() / 1000).toBeGreaterThanOrEqual(antes);
    expect(getLatestTokenSet(db)?.commitSha).toBe('agora');
  });
});
