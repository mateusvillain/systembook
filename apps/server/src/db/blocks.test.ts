import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BlockType } from '@systembook/schema';
import { blockTypeSchema, insertBlock, listBlocksByTab, type BlockContentFor } from './blocks.js';
import { createDb, type Db } from './client.js';
import { runMigrations } from './migrate.js';
import { blocks, pages, sections, tabs } from './schema.js';

// Um conteúdo representativo por tipo do MVP — as formas vêm de
// packages/schema (TASK-3) e foram confirmadas no editor nas TASK-27/28/29.
const SAMPLES: { [T in BlockType]: BlockContentFor<T> } = {
  heading: { level: 2, body: { type: 'heading', content: [{ type: 'text', text: 'Uso' }] } },
  paragraph: { body: { type: 'paragraph', content: [{ type: 'text', text: 'Olá' }] } },
  list: { ordered: true, items: [{ type: 'listItem', content: [] }] },
  code: { language: 'typescript', code: 'const x = 1;' },
  image: { src: '/uploads/button.png', alt: 'Botão primário', caption: null },
  table: {
    body: {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [{ type: 'tableHeader', attrs: { colspan: 1 }, content: [] }],
        },
      ],
    },
  },
  callout: { variant: 'warning', body: { type: 'paragraph', content: [] } },
  'component-embed': { componentName: 'Button', variantId: null },
};

describe('blocks (TASK-30)', () => {
  let dir: string;
  let db: Db;
  let tabId: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-blocks-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);

    const section = db.insert(sections).values({ titulo: 'Componentes', ordem: 0 }).returning().get();
    const page = db
      .insert(pages)
      .values({ sectionId: section.id, titulo: 'Button', slug: 'button', ordem: 0 })
      .returning()
      .get();
    tabId = db.insert(tabs).values({ pageId: page.id, titulo: 'Usage', ordem: 0 }).returning().get().id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('faz round-trip tipado dos 8 tipos de bloco do MVP', () => {
    (Object.keys(SAMPLES) as BlockType[]).forEach((tipo, ordem) => {
      insertBlock(db, { tabId, tipo, conteudo: SAMPLES[tipo], ordem });
    });

    const records = listBlocksByTab(db, tabId);
    expect(records.map((r) => r.tipo)).toEqual(Object.keys(SAMPLES));
    for (const record of records) {
      expect(record.conteudo).toEqual(SAMPLES[record.tipo]);
      expect(record.tabId).toBe(tabId);
    }
    // narrowing pela union discriminada funciona em runtime
    const callout = records.find((r) => r.tipo === 'callout');
    expect(callout?.tipo === 'callout' && callout.conteudo.variant).toBe('warning');
  });

  it('lista ordenado por (ordem, id) e escopado à tab', () => {
    const outraTab = db
      .insert(tabs)
      .values({ pageId: db.select().from(pages).get()!.id, titulo: 'Code', ordem: 1 })
      .returning()
      .get();
    insertBlock(db, { tabId, tipo: 'paragraph', conteudo: SAMPLES.paragraph, ordem: 1 });
    insertBlock(db, { tabId, tipo: 'code', conteudo: SAMPLES.code, ordem: 0 });
    insertBlock(db, { tabId: outraTab.id, tipo: 'image', conteudo: SAMPLES.image, ordem: 0 });

    const records = listBlocksByTab(db, tabId);
    expect(records.map((r) => r.tipo)).toEqual(['code', 'paragraph']);
    expect(listBlocksByTab(db, outraTab.id)).toHaveLength(1);
  });

  it('rejeita tipo fora do enum na camada de aplicação', () => {
    expect(() =>
      insertBlock(db, {
        tabId,
        tipo: 'video' as BlockType,
        conteudo: SAMPLES.paragraph,
        ordem: 0,
      }),
    ).toThrow();
    expect(blockTypeSchema.safeParse('component-embed').success).toBe(true);
    expect(blockTypeSchema.safeParse('video').success).toBe(false);
  });

  it('deletar a tab cascateia para os blocks', () => {
    insertBlock(db, { tabId, tipo: 'paragraph', conteudo: SAMPLES.paragraph, ordem: 0 });
    db.delete(tabs).where(eq(tabs.id, tabId)).run();
    expect(db.select().from(blocks).all()).toHaveLength(0);
  });
});
