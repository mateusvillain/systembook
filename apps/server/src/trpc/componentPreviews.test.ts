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
): void {
  const base = path.join(previewsRoot, ...pathEstatico.split('/'));
  mkdirSync(path.join(base, entryDir), { recursive: true });
  writeFileSync(path.join(base, entryDir, 'index.html'), '<!doctype html><title>preview</title>');
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

  it('resolve a URL do entryDir/index.html do artefato mais recente', async () => {
    const pathEstatico = 'Button/primary/abc123';
    insertComponentPreview(db, {
      componentName: 'Button',
      variantId: 'primary',
      commitSha: 'abc123',
      pathEstatico,
    });
    writeArtifact(previewsRoot, pathEstatico, 'button--primary');

    const caller = callerFor(db, editor, previewsRoot);
    const result = await caller.componentPreviews.getLatest({
      componentName: 'Button',
      variantId: 'primary',
    });

    expect(result).not.toBeNull();
    expect(result!.url).toBe('/previews/Button/primary/abc123/button--primary/index.html');
    expect(result!.commitSha).toBe('abc123');
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

  it('exige autenticação', async () => {
    const caller = callerFor(db, null, previewsRoot);
    await expect(
      caller.componentPreviews.getLatest({ componentName: 'Button', variantId: 'primary' }),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });
});
