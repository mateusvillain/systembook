import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { eq } from 'drizzle-orm';
import type { InstanceImport } from '@systembook/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TiptapDoc } from '../blocks/serialize.js';
import { createDb, type Db } from '../db/client.js';
import { IMPORT_REVISION_MESSAGE } from '../db/import.js';
import { ensureLandingPage, LANDING_PAGE_ID } from '../db/landing.js';
import { runMigrations } from '../db/migrate.js';
import { ensureSettings } from '../db/settings.js';
import { DEFAULT_MENU_ID, media, memberships, pages, revisions, tabs, users } from '../db/schema.js';
import { ensureDefaultStatusTags } from '../db/statusTags.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null, apiToken: string | null = null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user, apiToken });
}

const paragraph = (text: string, marks?: unknown[]): TiptapDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks && { marks }) }] }],
});
const link = (text: string, href: string) => paragraph(text, [{ type: 'link', attrs: { href } }]);

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('resto')]);

/** Projeto com um menu, uma seção, uma página com tab, imagem e link entre elas. */
function project(overrides: Partial<InstanceImport> = {}): InstanceImport {
  return {
    version: 1,
    settings: {
      nome: 'Acme DS',
      logo: { mime: 'image/svg+xml', base64: Buffer.from('<svg/>').toString('base64') },
      logoDark: null,
      statusTags: [{ titulo: 'Stable', cor: '#16a34a' }],
    },
    landing: link('Comece pelo botão', '/docs/componentes/acoes/button'),
    menus: [
      {
        titulo: 'Componentes',
        slug: 'componentes',
        sections: [
          {
            titulo: 'Ações',
            slug: 'acoes',
            pages: [
              {
                titulo: 'Button',
                slug: 'button',
                subtitulo: 'Dispara uma ação.',
                status: 'Stable',
                body: {
                  type: 'doc',
                  content: [
                    { type: 'image', attrs: { src: 'componentes/acoes/button.png', alt: 'Botão', caption: null } },
                    ...link('veja o uso', '/docs/componentes/acoes/button/usage#regras').content!,
                  ],
                },
                tabs: [{ titulo: 'Usage', slug: 'usage', doc: paragraph('uso') }],
              },
            ],
          },
        ],
      },
    ],
    images: [{ ref: 'componentes/acoes/button.png', mime: 'image/png', base64: PNG.toString('base64') }],
    overwrite: false,
    ...overrides,
  };
}

describe('migration.import (SYS-112)', () => {
  let dir: string;
  let db: Db;
  let admin: AuthUser;
  let token: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-import-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);
    ensureLandingPage(db);
    ensureDefaultStatusTags(db);
    ensureSettings(db);

    const user = db
      .insert(users)
      .values({ nome: 'admin', email: 'admin@test.local', senhaHash: 'irrelevante' })
      .returning({ id: users.id })
      .get();
    db.insert(memberships).values({ userId: user.id, role: 'admin' }).run();
    admin = { userId: user.id, role: 'admin', sessionId: 'fake-session' };
    token = (await callerFor(db, admin).uploadTokens.create({ label: 'import', escopo: 'migration' })).token;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // O contrato tipa os docs como `unknown` (TiptapJson); o input do router é o
  // do zod, que exige `type: 'doc'` — o cast é só da fronteira tipada.
  type RouterInput = Parameters<ReturnType<typeof callerFor>['migration']['import']>[0];
  const importing = (input: InstanceImport) => callerFor(db, null, token).migration.import(input as RouterInput);

  it('exige token de escopo migration', async () => {
    await expect(callerFor(db, null).migration.import(project() as RouterInput)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(callerFor(db, admin).migration.import(project() as RouterInput)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('instância vazia: cria e publica tudo, com o dono do token como autor', async () => {
    const result = await importing(project());
    expect(result).toEqual({
      created: { menus: 1, sections: 1, pages: 1 },
      replaced: 0,
      images: 1,
      settingsApplied: true,
    });

    const publicCaller = callerFor(db, null);
    const settings = await publicCaller.settings.getPublic();
    expect(settings.nomeDesignSystem).toBe('Acme DS');
    expect(settings.logoUrl).toMatch(/^\/api\/logo\/light\//);

    const page = await publicCaller.pages.getPublishedBySlug({
      menuSlug: 'componentes',
      sectionSlug: 'acoes',
      pageSlug: 'button',
    });
    expect(page).toMatchObject({ titulo: 'Button', subtitulo: 'Dispara uma ação.' });
    const [body, usage] = page!.snapshot!.tabs;
    expect(body!.isPrimary).toBe(true);
    expect(usage).toMatchObject({ titulo: 'Usage', isPrimary: false });

    // Imagem guardada na instância e o `src` apontando para ela.
    const image = body!.blocks[0]!;
    expect(image.type).toBe('image');
    const src = (image.content as { src: string }).src;
    expect(src).toMatch(/^\/api\/media\/[0-9a-f]{32}$/);
    const stored = db.select().from(media).get()!;
    expect(Buffer.from(stored.bytes).equals(PNG)).toBe(true);
    expect(src).toBe(`/api/media/${stored.hash}`);

    // Link para a tab: o slug do projeto vira o id da tab criada.
    const linkBlock = body!.blocks[1]!.content as { body: { marks: { attrs: { href: string } }[] }[] };
    expect(linkBlock.body[0]!.marks[0]!.attrs.href).toBe(`/docs/componentes/acoes/button/${usage!.tabId}#regras`);

    // Status tag criada a partir da config e ligada à página.
    const tags = await callerFor(db, admin).statusTags.list();
    const stable = tags.find((tag) => tag.titulo === 'Stable')!;
    expect(stable.cor).toBe('#16a34a');
    expect(db.select().from(pages).where(eq(pages.slug, 'button')).get()!.statusTagId).toBe(stable.id);

    // Landing publicada; todas as revisões no nome do dono do token.
    const landing = await publicCaller.landing.get();
    expect(landing.snapshot?.tabs[0]?.blocks).toHaveLength(1);
    const all = db.select().from(revisions).all();
    expect(all).toHaveLength(2);
    expect(all.every((rev) => rev.autorId === admin.userId && rev.mensagem === IMPORT_REVISION_MESSAGE)).toBe(true);

    // A busca indexou o conteúdo importado.
    const hits = await publicCaller.search.query({ q: 'uso' });
    expect(hits.length).toBeGreaterThan(0);
  });

  it('reaproveita menu e seção de mesmo slug e não toca nas settings de instância com conteúdo', async () => {
    const caller = callerFor(db, admin);
    await caller.settings.setNome({ nomeDesignSystem: 'Original' });
    const menu = await caller.menus.create({ titulo: 'Componentes' });
    const section = await caller.sections.create({ menuId: menu.id, titulo: 'Ações' });
    await caller.pages.create({ sectionId: section.id, titulo: 'Link', slug: 'link' });
    expect([menu.slug, section.slug]).toEqual(['componentes', 'acoes']);

    const result = await importing(project({ landing: null }));
    expect(result).toMatchObject({ created: { menus: 0, sections: 0, pages: 1 }, settingsApplied: false });
    expect((await callerFor(db, null).settings.getPublic()).nomeDesignSystem).toBe('Original');
    const slugs = db.select({ slug: pages.slug }).from(pages).where(eq(pages.sectionId, section.id)).all();
    expect(slugs.map((p) => p.slug).sort()).toEqual(['button', 'link']);
  });

  it('página que já existe: falha listando os conflitos e não grava nada', async () => {
    await importing(project());
    const before = db.select().from(revisions).all().length;

    const error = await importing(project()).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'CONFLICT' });
    expect((error as Error).message).toContain('componentes/acoes/button');
    expect((error as Error).message).toContain('landing');
    expect(db.select().from(revisions).all()).toHaveLength(before);
  });

  it('com overwrite, substitui a página (mesmo id, tabs do projeto) e publica de novo', async () => {
    await importing(project());
    const pageId = db.select().from(pages).where(eq(pages.slug, 'button')).get()!.id;

    const next = project({ overwrite: true });
    next.menus[0]!.sections[0]!.pages[0] = {
      ...next.menus[0]!.sections[0]!.pages[0]!,
      titulo: 'Button v2',
      body: paragraph('novo corpo'),
      tabs: [{ titulo: 'Code', slug: 'code', doc: paragraph('código') }],
    };
    const result = await importing(next);
    expect(result).toMatchObject({ created: { menus: 0, sections: 0, pages: 0 }, replaced: 1 });

    const page = await callerFor(db, null).pages.getPublishedBySlug({
      menuSlug: 'componentes',
      sectionSlug: 'acoes',
      pageSlug: 'button',
    });
    expect(page!.pageId).toBe(pageId);
    expect(page!.titulo).toBe('Button v2');
    expect(page!.snapshot!.tabs.map((tab) => tab.titulo)).toEqual(['Conteúdo', 'Code']);
    expect(db.select().from(tabs).where(eq(tabs.pageId, pageId)).all()).toHaveLength(2);
    expect(db.select().from(revisions).where(eq(revisions.pageId, pageId)).all()).toHaveLength(2);
    expect(db.select().from(revisions).where(eq(revisions.pageId, LANDING_PAGE_ID)).all()).toHaveLength(2);
  });

  it('seção com o slug de outra, em outro menu, é conflito mesmo com overwrite', async () => {
    const caller = callerFor(db, admin);
    await caller.sections.create({ menuId: DEFAULT_MENU_ID, titulo: 'Ações' });
    await expect(importing(project({ overwrite: true }))).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('a seção "acoes" já existe'),
    });
  });

  it('o mesmo slug de seção em dois menus do projeto é BAD_REQUEST', async () => {
    const input = project();
    input.menus.push({ ...input.menus[0]!, titulo: 'Padrões', slug: 'padroes' });
    await expect(importing(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('único na instância'),
    });
  });

  it('imagem cujo conteúdo não bate com o tipo é BAD_REQUEST', async () => {
    const input = project({
      images: [{ ref: 'componentes/acoes/button.png', mime: 'image/png', base64: Buffer.from('<html>').toString('base64') }],
    });
    await expect(importing(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.select().from(pages).where(eq(pages.slug, 'button')).get()).toBeUndefined();
  });

  it('nó desconhecido no doc é BAD_REQUEST e desfaz o que já tinha sido criado', async () => {
    const input = project({ landing: { type: 'doc', content: [{ type: 'video' }] } as never });
    await expect(importing(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.select().from(pages).where(eq(pages.slug, 'button')).get()).toBeUndefined();
    expect(db.select().from(media).all()).toEqual([]);
  });
});
