import { mkdtempSync, rmSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as tar from 'tar';
import {
  generateUploadToken,
  hashUploadToken,
} from '../auth/uploadTokens.js';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { componentPreviews, uploadTokens } from '../db/schema.js';
import { handlePreviewUpload, type PreviewUploadDeps } from './upload.js';

describe('POST /api/previews (TASK-43)', () => {
  let dir: string;
  let db: Db;
  let previewsRoot: string;
  let server: Server;
  let baseUrl: string;
  let token: string;

  async function startServer(overrides: Partial<PreviewUploadDeps> = {}) {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/previews' && req.method === 'POST') {
        void handlePreviewUpload(req, res, { db, previewsRoot, ...overrides });
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    baseUrl = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
  }

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-upload-test-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    previewsRoot = path.join(dir, 'previews');

    token = generateUploadToken();
    db.insert(uploadTokens).values({ tokenHash: hashUploadToken(token), label: 'CI' }).run();

    await startServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeArtifact(files: Record<string, string>): Promise<Buffer> {
    const srcDir = mkdtempSync(path.join(tmpdir(), 'systembook-artifact-'));
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(srcDir, rel)), { recursive: true });
      await writeFile(path.join(srcDir, rel), content);
    }
    const tarPath = path.join(srcDir, '..', `artifact-${path.basename(srcDir)}.tgz`);
    await tar.create({ gzip: true, cwd: srcDir, file: tarPath }, ['.']);
    const buffer = await readFile(tarPath);
    rmSync(srcDir, { recursive: true, force: true });
    rmSync(tarPath, { force: true });
    return buffer;
  }

  function uploadForm(
    artifact: Buffer | null,
    fields: Record<string, string>,
    authToken: string | null = token,
  ): Promise<Response> {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    if (artifact) form.append('artifact', new Blob([new Uint8Array(artifact)]), 'artifact.tar.gz');
    return fetch(`${baseUrl}/api/previews`, {
      method: 'POST',
      headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
      body: form,
    });
  }

  const FIELDS = { component_name: 'Button', variant_id: 'primary', commit_sha: 'abc1234' };

  it('upload válido extrai o artefato no path por trio e insere a linha', async () => {
    const artifact = await makeArtifact({
      'index.html': '<!doctype html><div id="root"></div>',
      'assets/bundle.js': 'console.log("preview");',
    });

    const res = await uploadForm(artifact, FIELDS);
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.componentName).toBe('Button');
    expect(body.pathEstatico).toBe('Button/primary/abc1234');

    const targetDir = path.join(previewsRoot, 'Button', 'primary', 'abc1234');
    expect(await readFile(path.join(targetDir, 'index.html'), 'utf8')).toContain('root');
    expect(await readFile(path.join(targetDir, 'assets', 'bundle.js'), 'utf8')).toContain('preview');

    const rows = db.select().from(componentPreviews).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.commitSha).toBe('abc1234');
  });

  it('re-upload do mesmo trio sobrescreve o path (sem arquivo órfão) e adiciona linha nova', async () => {
    await uploadForm(await makeArtifact({ 'index.html': 'v1', 'so-na-v1.txt': 'x' }), FIELDS);
    const res = await uploadForm(await makeArtifact({ 'index.html': 'v2' }), FIELDS);
    expect(res.status).toBe(201);

    const targetDir = path.join(previewsRoot, 'Button', 'primary', 'abc1234');
    expect(await readFile(path.join(targetDir, 'index.html'), 'utf8')).toBe('v2');
    await expect(access(path.join(targetDir, 'so-na-v1.txt'))).rejects.toThrow();

    expect(db.select().from(componentPreviews).all()).toHaveLength(2);
  });

  it('sem token, token inválido e token revogado retornam 401', async () => {
    const artifact = await makeArtifact({ 'index.html': 'x' });

    expect((await uploadForm(artifact, FIELDS, null)).status).toBe(401);
    expect((await uploadForm(artifact, FIELDS, generateUploadToken())).status).toBe(401);

    db.update(uploadTokens).set({ revogadoEm: new Date() }).run();
    expect((await uploadForm(artifact, FIELDS, token)).status).toBe(401);

    expect(db.select().from(componentPreviews).all()).toHaveLength(0);
  });

  it('campo obrigatório ausente retorna 400 com o nome do campo', async () => {
    const artifact = await makeArtifact({ 'index.html': 'x' });
    const res = await uploadForm(artifact, { component_name: 'Button', variant_id: 'primary' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('commit_sha');
  });

  it('tentativa de path traversal em component_name é rejeitada sem escrever fora do root', async () => {
    const artifact = await makeArtifact({ 'index.html': 'x' });
    for (const evil of ['../../etc', '..', 'a/b', 'a\\b', '.oculto']) {
      const res = await uploadForm(artifact, { ...FIELDS, component_name: evil });
      expect(res.status, `component_name=${evil}`).toBe(400);
    }
    // nada foi escrito fora do previewsRoot (nem o próprio root foi criado)
    await expect(access(path.join(dir, 'etc'))).rejects.toThrow();
    await expect(access(previewsRoot)).rejects.toThrow();
    expect(db.select().from(componentPreviews).all()).toHaveLength(0);
  });

  it('artefato que não é tar.gz retorna 400 e não deixa lixo no destino', async () => {
    const res = await uploadForm(Buffer.from('isto não é um tar'), FIELDS);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('tar.gz');
    await expect(
      access(path.join(previewsRoot, 'Button', 'primary', 'abc1234')),
    ).rejects.toThrow();
    expect(db.select().from(componentPreviews).all()).toHaveLength(0);
  });

  it('symlink dentro do archive é filtrado na extração (só File/Directory entram)', async () => {
    const srcDir = mkdtempSync(path.join(tmpdir(), 'systembook-symlink-'));
    await writeFile(path.join(srcDir, 'index.html'), 'ok');
    const { symlink } = await import('node:fs/promises');
    await symlink('/etc/hosts', path.join(srcDir, 'malicioso'));
    const tarPath = path.join(srcDir, '..', `artifact-${path.basename(srcDir)}.tgz`);
    await tar.create({ gzip: true, cwd: srcDir, file: tarPath }, ['.']);
    const artifact = await readFile(tarPath);
    rmSync(srcDir, { recursive: true, force: true });
    rmSync(tarPath, { force: true });

    const res = await uploadForm(artifact, FIELDS);
    expect(res.status).toBe(201);

    const targetDir = path.join(previewsRoot, 'Button', 'primary', 'abc1234');
    expect(await readFile(path.join(targetDir, 'index.html'), 'utf8')).toBe('ok');
    await expect(access(path.join(targetDir, 'malicioso'))).rejects.toThrow();
  });

  it('multipart sem arquivo artifact retorna 400', async () => {
    const res = await uploadForm(null, FIELDS);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('artifact');
  });

  it('artefato acima do limite retorna 400', async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await startServer({ maxArtifactBytes: 64 });

    const artifact = await makeArtifact({ 'index.html': 'x'.repeat(10_000) });
    const res = await uploadForm(artifact, FIELDS);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('tamanho máximo');
  });

  it('corpo que não é multipart retorna 400', async () => {
    const res = await fetch(`${baseUrl}/api/previews`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
