import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { insertComponentPreview } from '../db/componentPreviews.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, users } from '../db/schema.js';
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

/** Cria o layout `<sha>/<entryDir>/index.html` + `<sha>/assets/` do connector. */
function writeArtifact(
  previewsRoot: string,
  pathEstatico: string,
  entryDir: string,
  config?: unknown,
): void {
  const base = path.join(previewsRoot, ...pathEstatico.split('/'));
  mkdirSync(path.join(base, entryDir), { recursive: true });
  writeFileSync(path.join(base, entryDir, 'index.html'), '<!doctype html><title>preview</title>');
  if (config !== undefined) {
    writeFileSync(path.join(base, entryDir, 'preview-config.json'), JSON.stringify(config));
  }
  mkdirSync(path.join(base, 'assets'), { recursive: true });
  writeFileSync(path.join(base, 'assets', 'app.js'), '// bundle');
}

describe('componentPreviews.getLatest (TASK-47)', () => {
  let dir: string;
  let previewsRoot: string;
  let db: Db;
  let editor: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-cprev-'));
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
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolve a URL e a config do entryDir/index.html do artefato mais recente', async () => {
    const pathEstatico = 'Button/primary/abc123';
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'abc123',
      pathEstatico,
    });
    const config = {
      component: 'Button',
      variants: [{ id: 'primary', label: 'Primary', props: { children: 'Salvar' } }],
      controls: [
        { kind: 'boolean', propName: 'disabled' },
        { kind: 'select', propName: 'variant', options: ['primary', 'secondary'] },
      ],
    };
    writeArtifact(previewsRoot, pathEstatico, 'button--primary', config);

    const caller = callerFor(db, editor, previewsRoot);
    const result = await caller.componentPreviews.getLatest({
      componentName: 'Button',
      variantId: 'primary',
    });

    expect(result).not.toBeNull();
    expect(result!.url).toBe('/previews/Button/primary/abc123/button--primary/index.html');
    expect(result!.commitSha).toBe('abc123');
    expect(result!.config?.controls).toHaveLength(2);
    expect(result!.config?.component).toBe('Button');
  });

  it('config é null quando o artefato não tem preview-config.json (pré-TASK-49)', async () => {
    const pathEstatico = 'Button/primary/old';
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'old',
      pathEstatico,
    });
    writeArtifact(previewsRoot, pathEstatico, 'button--primary'); // sem config

    const caller = callerFor(db, editor, previewsRoot);
    const result = await caller.componentPreviews.getLatest({
      componentName: 'Button',
      variantId: 'primary',
    });
    expect(result!.config).toBeNull();
  });

  it('retorna a publicação mais recente quando há várias do mesmo par', async () => {
    for (const sha of ['old', 'new']) {
      const p = `Button/primary/${sha}`;
      insertComponentPreview(db, {
        componentName: 'Button',
        variantId: 'primary',
        commitSha: sha,
        pathEstatico: p,
      });
      writeArtifact(previewsRoot, p, 'button--primary');
    }

    const caller = callerFor(db, editor, previewsRoot);
    const result = await caller.componentPreviews.getLatest({
      componentName: 'Button',
      variantId: 'primary',
    });

    expect(result!.commitSha).toBe('new');
  });

  it('retorna null quando não há artefato publicado para o par', async () => {
    const caller = callerFor(db, editor, previewsRoot);
    const result = await caller.componentPreviews.getLatest({
      componentName: 'Card',
      variantId: 'default',
    });
    expect(result).toBeNull();
  });

  it('retorna null quando o registro existe mas os arquivos sumiram', async () => {
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'abc123',
      pathEstatico: 'Button/primary/abc123',
    });
    // sem writeArtifact — diretório inexistente no volume

    const caller = callerFor(db, editor, previewsRoot);
    const result = await caller.componentPreviews.getLatest({
      componentName: 'Button',
      variantId: 'primary',
    });
    expect(result).toBeNull();
  });

  it('getLatest é público (embed na doc pública deslogada, TASK-50)', async () => {
    const pathEstatico = 'Button/primary/pub';
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'pub',
      pathEstatico,
    });
    writeArtifact(previewsRoot, pathEstatico, 'button--primary');

    const caller = callerFor(db, null, previewsRoot); // sem usuário
    const result = await caller.componentPreviews.getLatest({
      componentName: 'Button',
      variantId: 'primary',
    });
    expect(result?.commitSha).toBe('pub');
  });

  describe('listagem para o picker (TASK-48)', () => {
    beforeEach(() => {
      // Button tem 2 variantes (primary duas vezes → distinct), Card só default.
      for (const [c, v, sha] of [
        ['Button', 'primary', 's1'],
        ['Button', 'primary', 's2'],
        ['Button', 'disabled', 's3'],
        ['Card', 'default', 's4'],
      ] as const) {
        insertComponentPreview(db, {
          componentName: c,
          variantId: v,
          commitSha: sha,
          pathEstatico: `${c}/${v}/${sha}`,
        });
      }
    });

    it('listComponents retorna nomes distintos ordenados', async () => {
      const caller = callerFor(db, editor, previewsRoot);
      const names = await caller.componentPreviews.listComponents();
      expect(names).toEqual(['Button', 'Card']);
    });

    it('listVariants retorna variantes distintas do componente', async () => {
      const caller = callerFor(db, editor, previewsRoot);
      const variants = await caller.componentPreviews.listVariants({ componentName: 'Button' });
      expect(variants).toEqual(['disabled', 'primary']);
    });

    it('listVariants de componente inexistente é vazio', async () => {
      const caller = callerFor(db, editor, previewsRoot);
      const variants = await caller.componentPreviews.listVariants({ componentName: 'Nope' });
      expect(variants).toEqual([]);
    });

    it('listComponents exige autenticação', async () => {
      const caller = callerFor(db, null, previewsRoot);
      await expect(caller.componentPreviews.listComponents()).rejects.toThrow(/UNAUTHORIZED/);
    });
  });
});
