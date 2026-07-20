import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from './client.js';
import { getLatestPreview, insertComponentPreview } from './componentPreviews.js';
import { runMigrations } from './migrate.js';

describe('component_previews (TASK-42)', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-previews-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('histórico é append-only: duas publicações do mesmo par coexistem e a mais recente vence', () => {
    const antiga = insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'aaa111',
      pathEstatico: 'previews/button--primary/aaa111',
      publicadoEm: new Date('2026-07-19T10:00:00Z'),
    });
    const recente = insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'bbb222',
      pathEstatico: 'previews/button--primary/bbb222',
      publicadoEm: new Date('2026-07-19T11:00:00Z'),
    });

    expect(antiga.id).not.toBe(recente.id);
    const latest = getLatestPreview(db, 'Button', 'primary');
    expect(latest?.commitSha).toBe('bbb222');
    expect(latest?.pathEstatico).toBe('previews/button--primary/bbb222');
    expect(latest?.publicadoEm).toEqual(new Date('2026-07-19T11:00:00Z'));
  });

  it('empate de publicado_em (mesmo segundo) desempata pela inserção mais recente', () => {
    const mesmoInstante = new Date('2026-07-19T12:00:00Z');
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'primeiro',
      pathEstatico: 'previews/a',
      publicadoEm: mesmoInstante,
    });
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'segundo',
      pathEstatico: 'previews/b',
      publicadoEm: mesmoInstante,
    });

    expect(getLatestPreview(db, 'Button', 'primary')?.commitSha).toBe('segundo');
  });

  it('resolve por par exato (componente, variante) e retorna null sem publicação', () => {
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'aaa',
      pathEstatico: 'previews/x',
    });
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'disabled',
      commitSha: 'bbb',
      pathEstatico: 'previews/y',
    });

    expect(getLatestPreview(db, 'Button', 'primary')?.commitSha).toBe('aaa');
    expect(getLatestPreview(db, 'Button', 'disabled')?.commitSha).toBe('bbb');
    expect(getLatestPreview(db, 'Button', 'hover')).toBeNull();
    expect(getLatestPreview(db, 'Card', 'primary')).toBeNull();
  });

  it('publicado_em tem default do banco quando omitido', () => {
    const antes = Math.floor(Date.now() / 1000);
    const row = insertComponentPreview(db, {
      componentName: 'Card',
      variantId: 'default',
      commitSha: 'ccc',
      pathEstatico: 'previews/z',
    });
    const depois = Math.ceil(Date.now() / 1000);

    const ts = Math.floor(row.publicadoEm.getTime() / 1000);
    expect(ts).toBeGreaterThanOrEqual(antes);
    expect(ts).toBeLessThanOrEqual(depois);
  });
});
