import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findActiveUploadToken } from '../auth/uploadTokens.js';
import type { TiptapDoc } from '../blocks/serialize.js';
import { createDb, type Db } from '../db/client.js';
import { ensureLandingPage, LANDING_PAGE_ID, LANDING_TAB_ID } from '../db/landing.js';
import { runMigrations } from '../db/migrate.js';
import { DEFAULT_MENU_ID, memberships, users } from '../db/schema.js';
import { ensureDefaultStatusTags } from '../db/statusTags.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null, apiToken: string | null = null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user, apiToken });
}

const paragraph = (text: string): TiptapDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('migration.export (SYS-110)', () => {
  let dir: string;
  let db: Db;
  let admin: AuthUser;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-export-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    ensureLandingPage(db);
    ensureDefaultStatusTags(db);

    const user = db
      .insert(users)
      .values({ nome: 'admin', email: 'admin@test.local', senhaHash: 'irrelevante' })
      .returning({ id: users.id })
      .get();
    db.insert(memberships).values({ userId: user.id, role: 'admin' }).run();
    admin = { userId: user.id, role: 'admin', sessionId: 'fake-session' };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function migrationToken(escopo: 'previews' | 'migration' = 'migration') {
    return (await callerFor(db, admin).uploadTokens.create({ label: 'export', escopo })).token;
  }

  it('exige token de escopo migration: sem token, de previews, inválido ou revogado é UNAUTHORIZED', async () => {
    const unauthorized = { code: 'UNAUTHORIZED' };
    await expect(callerFor(db, null).migration.export()).rejects.toMatchObject(unauthorized);
    // Sessão de admin não basta: a rota é do CLI, por token.
    await expect(callerFor(db, admin).migration.export()).rejects.toMatchObject(unauthorized);
    await expect(callerFor(db, null, 'inventado').migration.export()).rejects.toMatchObject(unauthorized);
    await expect(callerFor(db, null, await migrationToken('previews')).migration.export()).rejects.toMatchObject(
      unauthorized,
    );

    const caller = callerFor(db, admin);
    const { id, token } = await caller.uploadTokens.create({ label: 'x', escopo: 'migration' });
    await expect(callerFor(db, null, token).migration.export()).resolves.toMatchObject({ version: 1 });
    await caller.uploadTokens.revoke({ tokenId: id });
    await expect(callerFor(db, null, token).migration.export()).rejects.toMatchObject(unauthorized);
  });

  it('o token de migração não serve para o upload de previews', async () => {
    expect(findActiveUploadToken(db, await migrationToken(), 'previews')).toBeNull();
  });

  it('exporta a árvore com a última revisão publicada, a landing e as settings', async () => {
    const caller = callerFor(db, admin);
    await caller.settings.setNome({ nomeDesignSystem: 'Acme DS' });
    await caller.settings.uploadLogo({
      variant: 'light',
      mime: 'image/svg+xml',
      dataBase64: Buffer.from('<svg/>').toString('base64'),
    });

    const menu = await caller.menus.create({ titulo: 'Componentes' });
    const section = await caller.sections.create({ menuId: menu.id, titulo: 'Ações' });
    const button = await caller.pages.create({ sectionId: section.id, titulo: 'Button', slug: 'button' });
    await caller.pages.setSubtitulo({ id: button.id, subtitulo: 'Dispara uma ação.' });
    const [stable] = await caller.statusTags.list();
    await caller.pages.setStatusTag({ pageId: button.id, statusTagId: stable!.id });
    const body = await caller.tabs.getPrimary({ pageId: button.id });
    const usage = await caller.tabs.create({ pageId: button.id, titulo: 'Usage' });

    await caller.blocks.saveDraft({ tabId: body.id, doc: paragraph('v1') });
    await caller.blocks.saveDraft({ tabId: usage.id, doc: paragraph('uso') });
    await caller.pages.publish({ pageId: button.id });
    await caller.blocks.saveDraft({ tabId: body.id, doc: paragraph('v2') });
    await caller.pages.publish({ pageId: button.id });
    // Rascunho depois do último publish não entra.
    await caller.blocks.saveDraft({ tabId: body.id, doc: paragraph('rascunho') });

    // Nunca publicada: fica de fora e é listada.
    await caller.pages.create({ sectionId: section.id, titulo: 'Link', slug: 'link' });
    // Seção do menu padrão sem nada publicado.
    await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'Vazia' });

    await caller.blocks.saveDraft({ tabId: LANDING_TAB_ID, doc: paragraph('Bem-vindo') });
    await caller.pages.publish({ pageId: LANDING_PAGE_ID });

    const exported = await callerFor(db, null, await migrationToken()).migration.export();

    expect(exported.version).toBe(1);
    expect(exported.settings).toEqual({
      nome: 'Acme DS',
      logo: { mime: 'image/svg+xml', base64: Buffer.from('<svg/>').toString('base64') },
      logoDark: null,
      statusTags: expect.arrayContaining([{ titulo: stable!.titulo, cor: stable!.cor }]),
    });
    expect(exported.landing?.tabs[0]?.blocks).toEqual([
      expect.objectContaining({ type: 'paragraph', content: { body: [{ type: 'text', text: 'Bem-vindo' }] } }),
    ]);

    const components = exported.menus.find((m) => m.slug === menu.slug!)!;
    expect(components.titulo).toBe('Componentes');
    const [actions] = components.sections;
    expect(actions).toMatchObject({ titulo: 'Ações', slug: section.slug });
    expect(actions!.pages).toHaveLength(1);
    const [page] = actions!.pages;
    expect(page).toMatchObject({
      titulo: 'Button',
      slug: 'button',
      subtitulo: 'Dispara uma ação.',
      status: stable!.titulo,
    });
    const primary = page!.snapshot.tabs.find((tab) => tab.isPrimary)!;
    expect(primary.blocks[0]?.content).toEqual({ body: [{ type: 'text', text: 'v2' }] });
    expect(page!.snapshot.tabs.map((tab) => tab.titulo)).toContain('Usage');

    expect(exported.unpublished).toEqual([
      { menu: menu.slug, section: section.slug, slug: 'link', titulo: 'Link' },
    ]);
    // A seção reservada da landing nunca aparece na árvore.
    const allSections = exported.menus.flatMap((m) => m.sections.map((s) => s.slug));
    expect(allSections).not.toContain('__sb_landing__');
  });

  it('instância sem nada publicado: landing nula e menus sem páginas', async () => {
    const exported = await callerFor(db, null, await migrationToken()).migration.export();
    expect(exported.landing).toBeNull();
    expect(exported.menus.flatMap((m) => m.sections.flatMap((s) => s.pages))).toEqual([]);
    expect(exported.unpublished).toEqual([]);
  });
});
