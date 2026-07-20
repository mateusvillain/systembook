import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handlePreviewRequest, PREVIEWS_URL_PREFIX } from './serve.js';

describe('GET /previews/* (TASK-46)', () => {
  let dir: string;
  let previewsRoot: string;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-serve-test-'));
    previewsRoot = path.join(dir, 'previews');

    // artefato como o upload da TASK-43 grava: <comp>/<variant>/<sha>/...
    const artifact = path.join(previewsRoot, 'button', 'primary', 'abc123', 'button--primary');
    await mkdir(path.join(artifact, '..', 'assets'), { recursive: true });
    await mkdir(artifact, { recursive: true });
    await writeFile(path.join(artifact, 'index.html'), '<!doctype html><p>preview</p>');
    await writeFile(
      path.join(artifact, '..', 'assets', 'index-abc.js'),
      'console.log("preview")',
    );

    // arquivo fora do root, alvo de um traversal bem-sucedido
    await writeFile(path.join(dir, 'secret.txt'), 'segredo');

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname.startsWith(PREVIEWS_URL_PREFIX)) {
        void handlePreviewRequest(req.method, url.pathname, res, { previewsRoot });
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    baseUrl = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterEach(async () => {
    // sem isso o close() espera o keep-alive do fetch anterior expirar (~3s)
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it('serve o index.html do artefato com content-type e cache imutável', async () => {
    const res = await fetch(
      `${baseUrl}/previews/button/primary/abc123/button--primary/index.html`,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    await expect(res.text()).resolves.toContain('<p>preview</p>');
  });

  it('serve assets com o content-type derivado da extensão', async () => {
    const res = await fetch(`${baseUrl}/previews/button/primary/abc123/assets/index-abc.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  });

  it('serve index.html quando a URL aponta para o diretório da entry', async () => {
    const res = await fetch(`${baseUrl}/previews/button/primary/abc123/button--primary/`);

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain('<p>preview</p>');
  });

  it('não serve arquivo fora do root (path traversal cru)', async () => {
    const res = await fetch(`${baseUrl}/previews/button/../../secret.txt`);

    expect([400, 404]).toContain(res.status);
    await expect(res.text()).resolves.not.toContain('segredo');
  });

  it('não serve arquivo fora do root (traversal percent-encoded)', async () => {
    const res = await fetch(`${baseUrl}/previews/button/%2e%2e/%2e%2e/secret.txt`);

    // o cliente pode normalizar `%2e%2e` antes de enviar; o que importa é que
    // nunca vira 200 com o arquivo de fora
    expect([400, 404]).toContain(res.status);
    await expect(res.text()).resolves.not.toContain('segredo');
  });

  it('rejeita segmento com barra encodada', async () => {
    const res = await fetch(`${baseUrl}/previews/button/primary/abc123/..%2f..%2fsecret.txt`);

    expect(res.status).toBe(400);
  });

  it('retorna 404 JSON para commit sha inexistente', async () => {
    const res = await fetch(`${baseUrl}/previews/button/primary/deadbeef/index.html`);

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toEqual({
      error: 'artefato de preview não encontrado',
    });
  });

  it('retorna 404 para arquivo inexistente dentro de um artefato existente', async () => {
    const res = await fetch(`${baseUrl}/previews/button/primary/abc123/nope.js`);

    expect(res.status).toBe(404);
  });

  it('não exige autenticação (nenhum header enviado)', async () => {
    const res = await fetch(
      `${baseUrl}/previews/button/primary/abc123/button--primary/index.html`,
    );

    expect(res.status).toBe(200);
  });

  it('rejeita métodos que não sejam GET/HEAD', async () => {
    const res = await fetch(
      `${baseUrl}/previews/button/primary/abc123/button--primary/index.html`,
      { method: 'DELETE' },
    );

    expect(res.status).toBe(405);
  });
});
