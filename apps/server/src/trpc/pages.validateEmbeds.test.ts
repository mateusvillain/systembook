import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insertBlock } from '../db/blocks.js';
import { createDb, type Db } from '../db/client.js';
import { insertComponentPreview } from '../db/componentPreviews.js';
import { runMigrations } from '../db/migrate.js';
import { DEFAULT_MENU_ID, memberships, users } from '../db/schema.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null, previewsRoot?: string) {
  return appRouter.createCaller({
    db,
    res: null as unknown as ServerResponse,
    user,
    previewsRoot,
  });
}

/** Mesmo layout `<sha>/<entryDir>/index.html` que o connector grava (TASK-41). */
function writeArtifact(previewsRoot: string, pathEstatico: string, entryDir: string): void {
  const base = path.join(previewsRoot, ...pathEstatico.split('/'));
  mkdirSync(path.join(base, entryDir), { recursive: true });
  writeFileSync(path.join(base, entryDir, 'index.html'), '<!doctype html><title>preview</title>');
}

/** Registro + artefato em disco: o par resolve como na doc pública. */
function publishPreview(db: Db, previewsRoot: string, componentName: string, variantId: string) {
  const pathEstatico = `${componentName}/${variantId}/sha-${componentName}-${variantId}`;
  insertComponentPreview(db, {
    componentName,
    variantId,
    commitSha: `sha-${componentName}-${variantId}`,
    pathEstatico,
  });
  writeArtifact(previewsRoot, pathEstatico, `${componentName}--${variantId}`);
}

describe('pages.validateEmbeds (SYS-61)', () => {
  let dir: string;
  let previewsRoot: string;
  let db: Db;
  let editor: AuthUser;
  let pageId: string;
  let tabId: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-validate-embeds-'));
    previewsRoot = path.join(dir, 'previews');
    mkdirSync(previewsRoot, { recursive: true });
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);

    const user = db
      .insert(users)
      .values({ nome: 'editor', email: 'editor@test.local', senhaHash: 'irrelevante' })
      .returning({ id: users.id })
      .get();
    db.insert(memberships).values({ userId: user.id, role: 'editor' }).run();
    editor = { userId: user.id, role: 'editor', sessionId: 'fake-session' };

    const caller = callerFor(db, editor, previewsRoot);
    const section = await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'Componentes' });
    pageId = (await caller.pages.create({ sectionId: section.id, titulo: 'Button', slug: 'button' })).id;
    tabId = (await caller.tabs.create({ pageId, titulo: 'Usage' })).id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('não reporta nada quando o embed resolve a um artefato existente', async () => {
    publishPreview(db, previewsRoot, 'Button', 'primary');
    insertBlock(db, {
      tabId,
      tipo: 'component-embed',
      conteudo: { componentName: 'Button', variantId: 'primary' },
      ordem: 0,
    });

    const caller = callerFor(db, editor, previewsRoot);
    expect(await caller.pages.validateEmbeds({ pageId })).toEqual([]);
  });

  it('reporta o embed cujo par nunca foi publicado pelo CI', async () => {
    const block = insertBlock(db, {
      tabId,
      tipo: 'component-embed',
      conteudo: { componentName: 'Button', variantId: 'ghost' },
      ordem: 0,
    });

    const caller = callerFor(db, editor, previewsRoot);
    const broken = await caller.pages.validateEmbeds({ pageId });

    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({
      blockId: block.id,
      tabId,
      tabTitulo: 'Usage',
      componentName: 'Button',
      variantId: 'ghost',
      reason: 'no-publication',
    });
  });

  it('reporta o embed cujo registro existe mas os arquivos sumiram do volume', async () => {
    // Registro sem artefato em disco — o caso "volume recriado" que hoje só
    // aparece como placeholder na doc pública.
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'abc123',
      pathEstatico: 'Button/primary/abc123',
    });
    insertBlock(db, {
      tabId,
      tipo: 'component-embed',
      conteudo: { componentName: 'Button', variantId: 'primary' },
      ordem: 0,
    });

    const caller = callerFor(db, editor, previewsRoot);
    const broken = await caller.pages.validateEmbeds({ pageId });

    expect(broken).toHaveLength(1);
    expect(broken[0]?.reason).toBe('artifact-missing');
  });

  it('reporta o embed sem variante escolhida', async () => {
    insertBlock(db, {
      tabId,
      tipo: 'component-embed',
      conteudo: { componentName: 'Button', variantId: null },
      ordem: 0,
    });

    const caller = callerFor(db, editor, previewsRoot);
    const broken = await caller.pages.validateEmbeds({ pageId });

    expect(broken).toHaveLength(1);
    expect(broken[0]?.reason).toBe('variant-unset');
  });

  it('também valida o cover component-embed de um bloco dos-donts', async () => {
    publishPreview(db, previewsRoot, 'Button', 'primary');
    // cover válido → não reportado
    insertBlock(db, {
      tabId,
      tipo: 'dos-donts',
      conteudo: {
        variant: 'do',
        titulo: 'Use o primário',
        descricao: [],
        cover: { kind: 'component-embed', componentName: 'Button', variantId: 'primary' },
      },
      ordem: 0,
    });
    const quebrado = insertBlock(db, {
      tabId,
      tipo: 'dos-donts',
      conteudo: {
        variant: 'dont',
        titulo: 'Não use o fantasma',
        descricao: [],
        cover: { kind: 'component-embed', componentName: 'Button', variantId: 'ghost' },
      },
      ordem: 1,
    });

    const caller = callerFor(db, editor, previewsRoot);
    const broken = await caller.pages.validateEmbeds({ pageId });

    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ blockId: quebrado.id, reason: 'no-publication' });
  });

  it('ignora cover de imagem e blocos sem embed', async () => {
    insertBlock(db, {
      tabId,
      tipo: 'dos-donts',
      conteudo: {
        variant: 'do',
        titulo: 'Com imagem',
        descricao: [],
        cover: { kind: 'image', src: '/uploads/x.png', alt: 'x' },
      },
      ordem: 0,
    });
    insertBlock(db, {
      tabId,
      tipo: 'code',
      conteudo: { language: 'tsx', code: '<Button />' },
      ordem: 1,
    });

    const caller = callerFor(db, editor, previewsRoot);
    expect(await caller.pages.validateEmbeds({ pageId })).toEqual([]);
  });

  it('reporta cada bloco quebrado, mesmo repetindo o mesmo par', async () => {
    const a = insertBlock(db, {
      tabId,
      tipo: 'component-embed',
      conteudo: { componentName: 'Button', variantId: 'ghost' },
      ordem: 0,
    });
    const b = insertBlock(db, {
      tabId,
      tipo: 'component-embed',
      conteudo: { componentName: 'Button', variantId: 'ghost' },
      ordem: 1,
    });

    const caller = callerFor(db, editor, previewsRoot);
    const broken = await caller.pages.validateEmbeds({ pageId });

    // A resolução é memoizada por par, mas o report é por bloco — a UI (SYS-62)
    // precisa apontar cada bloco a corrigir.
    expect(broken.map((e) => e.blockId).sort()).toEqual([a.id, b.id].sort());
  });

  it('exige autenticação', async () => {
    const anon = callerFor(db, null, previewsRoot);
    await expect(anon.pages.validateEmbeds({ pageId })).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('404 em página inexistente', async () => {
    const caller = callerFor(db, editor, previewsRoot);
    await expect(caller.pages.validateEmbeds({ pageId: 'nao-existe' })).rejects.toThrow(
      /Page not found/,
    );
  });
});
