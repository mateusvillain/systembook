import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, users } from '../db/schema.js';
import { MAX_LOGO_BYTES, readLogo } from '../db/settings.js';
import { parseLogoPath } from '../logo/serve.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

function userWithRole(db: Db, role: 'admin' | 'editor'): AuthUser {
  const row = db
    .insert(users)
    .values({ nome: role, email: `${role}@test.local`, senhaHash: 'x' })
    .returning({ id: users.id })
    .get();
  db.insert(memberships).values({ userId: row.id, role }).run();
  return { userId: row.id, role, sessionId: `s-${role}` };
}

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('conteudo-fake-de-png'),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
const b64 = (b: Buffer) => b.toString('base64');

describe('settings / identidade da instância (SYS-39)', () => {
  let dir: string;
  let db: Db;
  let admin: AuthUser;
  let editor: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-settings-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    admin = userWithRole(db, 'admin');
    editor = userWithRole(db, 'editor');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('getPublic funciona sem auth e começa sem logo, com nome padrão', async () => {
    const anon = callerFor(db, null);
    expect(await anon.settings.getPublic()).toEqual({
      nomeDesignSystem: 'Documentation',
      logoUrl: null,
      logoDarkUrl: null,
    });
  });

  it('só admin gerencia a identidade — editor recebe FORBIDDEN', async () => {
    const asEditor = callerFor(db, editor);
    await expect(asEditor.settings.get()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asEditor.settings.setNome({ nomeDesignSystem: 'X' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      asEditor.settings.uploadLogo({ variant: 'light', mime: 'image/png', dataBase64: b64(PNG) }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asEditor.settings.removeLogo({ variant: 'light' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    // E anônimo não passa nem de UNAUTHORIZED.
    await expect(callerFor(db, null).settings.get()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('sobe, troca e remove o logo; a URL pública carrega o hash do conteúdo', async () => {
    const caller = callerFor(db, admin);
    const anon = callerFor(db, null);

    const { url } = await caller.settings.uploadLogo({
      variant: 'light',
      mime: 'image/png',
      dataBase64: b64(PNG),
    });
    expect(url).toMatch(/^\/api\/logo\/light\/[0-9a-f]{16}$/);
    expect((await anon.settings.getPublic()).logoUrl).toBe(url);
    expect(readLogo(db, 'light')?.bytes.equals(PNG)).toBe(true);

    // Trocar o arquivo muda a URL — é isso que impede um cache de devolver o
    // logo antigo.
    const outro = Buffer.concat([PNG, Buffer.from('!')]);
    const trocado = await caller.settings.uploadLogo({
      variant: 'light',
      mime: 'image/png',
      dataBase64: b64(outro),
    });
    expect(trocado.url).not.toBe(url);

    await caller.settings.removeLogo({ variant: 'light' });
    expect(await anon.settings.getPublic()).toMatchObject({ logoUrl: null });
    expect(readLogo(db, 'light')).toBeNull();
  });

  it('as variantes light e dark são independentes', async () => {
    const caller = callerFor(db, admin);
    await caller.settings.uploadLogo({ variant: 'light', mime: 'image/png', dataBase64: b64(PNG) });
    await caller.settings.uploadLogo({ variant: 'dark', mime: 'image/svg+xml', dataBase64: b64(SVG) });

    const pub = await callerFor(db, null).settings.getPublic();
    expect(pub.logoUrl).toMatch(/^\/api\/logo\/light\//);
    expect(pub.logoDarkUrl).toMatch(/^\/api\/logo\/dark\//);

    // Remover a dark não toca na clara.
    await caller.settings.removeLogo({ variant: 'dark' });
    const depois = await callerFor(db, null).settings.getPublic();
    expect(depois.logoDarkUrl).toBeNull();
    expect(depois.logoUrl).toBe(pub.logoUrl);
  });

  it('rejeita tipo não permitido, arquivo grande demais e conteúdo que não bate com o mime', async () => {
    const caller = callerFor(db, admin);

    // Tipo fora da lista: barrado pelo próprio schema do input.
    await expect(
      // @ts-expect-error — mime inválido de propósito
      caller.settings.uploadLogo({ variant: 'light', mime: 'text/html', dataBase64: b64(PNG) }),
    ).rejects.toBeTruthy();

    // Acima do teto de tamanho.
    const gigante = Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES, 0x41)]);
    await expect(
      caller.settings.uploadLogo({ variant: 'light', mime: 'image/png', dataBase64: b64(gigante) }),
    ).rejects.toBeTruthy();

    // Conteúdo HTML declarado como PNG: sem esta checagem, serviríamos HTML
    // com `Content-Type: image/png` na nossa origem.
    await expect(
      caller.settings.uploadLogo({
        variant: 'light',
        mime: 'image/png',
        dataBase64: b64(Buffer.from('<html><script>alert(1)</script></html>')),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // E o inverso: SVG de verdade declarado como SVG passa.
    await expect(
      caller.settings.uploadLogo({ variant: 'light', mime: 'image/svg+xml', dataBase64: b64(SVG) }),
    ).resolves.toMatchObject({ url: expect.stringContaining('/api/logo/light/') });
  });

  it('setNome persiste e alimenta o fallback público', async () => {
    const caller = callerFor(db, admin);
    await caller.settings.setNome({ nomeDesignSystem: 'Acme Design System' });
    expect((await callerFor(db, null).settings.getPublic()).nomeDesignSystem).toBe(
      'Acme Design System',
    );
    await expect(caller.settings.setNome({ nomeDesignSystem: '' })).rejects.toBeTruthy();
  });

  it('parseLogoPath só aceita variante conhecida e path exato', () => {
    expect(parseLogoPath('/api/logo/light/abc123')).toEqual({ variant: 'light', hash: 'abc123' });
    expect(parseLogoPath('/api/logo/dark/abc123')).toEqual({ variant: 'dark', hash: 'abc123' });
    expect(parseLogoPath('/api/logo/other/abc')).toBeNull();
    expect(parseLogoPath('/api/logo/light')).toBeNull();
    // Segmento extra não é logo — fecha a porta para travessia de path.
    expect(parseLogoPath('/api/logo/light/abc/../../etc/passwd')).toBeNull();
    expect(parseLogoPath('/previews/x/y/z')).toBeNull();
  });
});
