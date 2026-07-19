import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PageSnapshot } from '@systembook/schema';
import { createDb, type Db } from './client.js';
import { runMigrations } from './migrate.js';
import { pages, revisions, sections, users } from './schema.js';

describe('revisions (TASK-33)', () => {
  let dir: string;
  let db: Db;
  let pageId: string;
  let autorId: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-revisions-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);

    const section = db.insert(sections).values({ titulo: 'Componentes', ordem: 0 }).returning().get();
    pageId = db
      .insert(pages)
      .values({ sectionId: section.id, titulo: 'Button', slug: 'button', ordem: 0 })
      .returning()
      .get().id;
    autorId = db
      .insert(users)
      .values({ nome: 'Autora', email: 'autora@test.local', senhaHash: 'irrelevante' })
      .returning()
      .get().id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function insertSampleRevision(): { id: string; snapshot: PageSnapshot } {
    // Snapshot de página inteira: duas tabs, cada uma com seus blocks
    const snapshot: PageSnapshot = {
      tabs: [
        {
          tabId: 'tab-usage',
          titulo: 'Usage',
          blocks: [
            {
              id: 'b1',
              tabId: 'tab-usage',
              type: 'paragraph',
              content: { body: [{ type: 'text', text: 'Olá' }] },
              ordem: 0,
            },
          ],
        },
        {
          tabId: 'tab-code',
          titulo: 'Code',
          blocks: [
            {
              id: 'b2',
              tabId: 'tab-code',
              type: 'code',
              content: { language: 'tsx', code: '<Button />' },
              ordem: 0,
            },
          ],
        },
      ],
    };
    const row = db
      .insert(revisions)
      .values({
        pageId,
        snapshotJson: JSON.stringify(snapshot),
        autorId,
        mensagem: 'Primeira versão',
      })
      .returning()
      .get();
    return { id: row.id, snapshot };
  }

  it('grava e lê snapshot de página inteira (duas tabs) com metadados', () => {
    const { id, snapshot } = insertSampleRevision();
    const row = db.select().from(revisions).where(eq(revisions.id, id)).get()!;

    expect(JSON.parse(row.snapshotJson)).toEqual(snapshot);
    expect(row.autorId).toBe(autorId);
    expect(row.mensagem).toBe('Primeira versão');
    expect(row.criadoEm).toBeInstanceOf(Date);
  });

  it('mensagem é opcional', () => {
    const row = db
      .insert(revisions)
      .values({ pageId, snapshotJson: '{"tabs":[]}', autorId })
      .returning()
      .get();
    expect(row.mensagem).toBeNull();
  });

  it('deletar a página cascateia para as revisões', () => {
    insertSampleRevision();
    db.delete(pages).where(eq(pages.id, pageId)).run();
    expect(db.select().from(revisions).all()).toHaveLength(0);
  });

  it('hard delete do autor preserva a revisão com autor_id null (SET NULL)', () => {
    const { id } = insertSampleRevision();
    db.delete(users).where(eq(users.id, autorId)).run();

    const row = db.select().from(revisions).where(eq(revisions.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.autorId).toBeNull();
  });
});
