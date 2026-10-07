import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateUploadToken, hashUploadToken } from '../auth/uploadTokens.js';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { tokenSets, uploadTokens, type TokenScope } from '../db/schema.js';
import { getLatestTokenSet } from '../db/tokenSets.js';
import { handleTokensUpload, type TokensUploadDeps } from './upload.js';

const BASE = JSON.stringify({
  color: { brand: { $type: 'color', $value: '#4f46e5' }, fg: { $type: 'color', $value: '{color.brand}' } },
});
const DARK = JSON.stringify({ color: { brand: { $value: '#818cf8' } } });

describe('POST /api/tokens (SYS-142)', () => {
  let dir: string;
  let db: Db;
  let server: Server;
  let baseUrl: string;

  /** Um token de upload ativo do escopo pedido. */
  function tokenFor(escopo: TokenScope, revoked = false): string {
    const token = generateUploadToken();
    db.insert(uploadTokens)
      .values({ tokenHash: hashUploadToken(token), label: escopo, escopo, ...(revoked && { revogadoEm: new Date() }) })
      .run();
    return token;
  }

  async function startServer(overrides: Partial<TokensUploadDeps> = {}) {
    server = createServer((req, res) => void handleTokensUpload(req, res, { db, ...overrides }));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    baseUrl = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
  }

  const post = (token: string | null, body: unknown) =>
    fetch(`${baseUrl}/api/tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-tokens-upload-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    await startServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    rmSync(dir, { recursive: true, force: true });
  });

  it('payload válido grava o conjunto resolvido com o commitSha', async () => {
    const res = await post(tokenFor('tokens'), {
      commitSha: 'abc123',
      sources: [
        { file: 'tokens/base.json', content: BASE },
        { file: 'tokens/light.json', content: '{}', mode: 'light' },
        { file: 'tokens/dark.json', content: DARK, mode: 'dark' },
      ],
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ commitSha: 'abc123', modes: ['light', 'dark'], tokens: 2, warnings: [] });

    const latest = getLatestTokenSet(db)!;
    expect(latest.commitSha).toBe('abc123');
    const fg = latest.tokenSet.tokens.find((t) => t.path === 'color.fg')!;
    expect(fg.byMode.light!.resolvedValue).toBe('#4f46e5');
    expect(fg.byMode.dark).toEqual({ value: '{color.brand}', resolvedValue: '#818cf8', aliasOf: 'color.brand' });
  });

  it('avisos não barram e voltam na resposta', async () => {
    const content = JSON.stringify({ ok: { $type: 'color', $value: '#fff', $foo: 1 } });
    const res = await post(tokenFor('tokens'), { commitSha: 'w', sources: [{ file: 'a.json', content }] });
    expect(res.status).toBe(201);
    expect((await res.json()).warnings).toEqual([
      expect.objectContaining({ severity: 'warning', file: 'a.json', path: 'ok' }),
    ]);
  });

  it('tokens inválidos: 422 com todos os diagnósticos, sem gravar', async () => {
    const content = JSON.stringify({
      bad: { $type: 'color', $value: 'nope' },
      broken: { $type: 'color', $value: '{missing}' },
    });
    const res = await post(tokenFor('tokens'), { commitSha: 'x', sources: [{ file: 'a.json', content }] });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.diagnostics.map((d: { path: string }) => d.path).sort()).toEqual(['bad', 'broken']);
    expect(db.select().from(tokenSets).all()).toEqual([]);
  });

  it('JSON de arquivo quebrado também é diagnóstico (422), não 400', async () => {
    const res = await post(tokenFor('tokens'), { commitSha: 'x', sources: [{ file: 'a.json', content: '{' }] });
    expect(res.status).toBe(422);
    expect((await res.json()).diagnostics[0]).toMatchObject({ severity: 'error', file: 'a.json' });
  });

  it('auth: sem token, desconhecido ou revogado → 401; de outro escopo → 403', async () => {
    const body = { commitSha: 'x', sources: [{ file: 'a.json', content: BASE }] };
    expect((await post(null, body)).status).toBe(401);
    expect((await post('nao-existe', body)).status).toBe(401);
    expect((await post(tokenFor('tokens', true), body)).status).toBe(401);
    const forbidden = await post(tokenFor('previews'), body);
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error).toContain('"previews"');
    expect((await post(tokenFor('migration'), body)).status).toBe(403);
    expect(db.select().from(tokenSets).all()).toEqual([]);
  });

  it('corpo inválido → 400; grande demais → 413', async () => {
    const token = tokenFor('tokens');
    expect((await post(token, '{nope')).status).toBe(400);
    expect((await post(token, { commitSha: '', sources: [] })).status).toBe(400);
    expect((await post(token, { commitSha: 'x', sources: [{ file: 'a.json' }] })).status).toBe(400);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await startServer({ maxBodyBytes: 64 });
    const big = await post(token, { commitSha: 'x', sources: [{ file: 'a.json', content: BASE.repeat(4) }] });
    expect(big.status).toBe(413);
  });
});
