import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { memberships, users } from '../db/schema.js';
import { appRouter } from './router.js';
import type { AuthUser } from './context.js';

function callerFor(db: Db, user: AuthUser | null) {
  return appRouter.createCaller({ db, res: null as unknown as ServerResponse, user });
}

// Trava a matriz de permissões da TASK-24 (documentada em router.ts):
// editor tem CRUD completo da estrutura de navegação, mas nenhum acesso a
// users.*. structure.test.ts já cobre não autenticado → UNAUTHORIZED.
describe('matriz de permissões (TASK-24)', () => {
  let dir: string;
  let db: Db;
  let editor: AuthUser;
  let adminId: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'systembook-permissions-'));
    db = createDb(path.join(dir, 'test.db'));
    runMigrations(db);

    for (const role of ['admin', 'editor'] as const) {
      const user = db
        .insert(users)
        .values({ nome: role, email: `${role}@test.local`, senhaHash: 'irrelevante' })
        .returning({ id: users.id })
        .get();
      db.insert(memberships).values({ userId: user.id, role }).run();
      if (role === 'admin') adminId = user.id;
      else editor = { userId: user.id, role, sessionId: 'fake-session' };
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('editor executa o CRUD completo de sections, pages e tabs', async () => {
    const caller = callerFor(db, editor);

    const section = await caller.sections.create({ titulo: 'Componentes' });
    await caller.sections.rename({ id: section.id, titulo: 'Fundamentos' });
    await caller.sections.reorder({ orderedIds: [section.id] });

    const page = await caller.pages.create({
      sectionId: section.id,
      titulo: 'Button',
      slug: 'button',
    });
    await caller.pages.rename({ id: page.id, titulo: 'Botão' });
    await caller.pages.updateSlug({ id: page.id, slug: 'botao' });
    await caller.pages.reorder({ sectionId: section.id, orderedIds: [page.id] });

    const tab = await caller.tabs.create({ pageId: page.id, titulo: 'Usage' });
    await caller.tabs.rename({ id: tab.id, titulo: 'Uso' });
    await caller.tabs.reorder({ pageId: page.id, orderedIds: [tab.id] });

    await caller.tabs.delete({ id: tab.id });
    await caller.pages.delete({ id: page.id });
    await caller.sections.delete({ id: section.id });

    expect(await caller.sections.list()).toHaveLength(0);
  });

  it('editor recebe FORBIDDEN em todas as procedures de users.*', async () => {
    const caller = callerFor(db, editor);
    const forbidden = { code: 'FORBIDDEN' };

    await expect(caller.users.list()).rejects.toMatchObject(forbidden);
    await expect(
      caller.users.create({
        nome: 'Intruso',
        email: 'intruso@test.local',
        password: 'senha-longa',
        role: 'admin',
      }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      caller.users.update({ userId: adminId, role: 'editor' }),
    ).rejects.toMatchObject(forbidden);
    await expect(caller.users.deactivate({ userId: adminId })).rejects.toMatchObject(forbidden);
    await expect(
      caller.users.resetPassword({ userId: adminId, newPassword: 'outra-senha' }),
    ).rejects.toMatchObject(forbidden);

    // nada vazou: o admin continua com a role original
    const membership = db
      .select({ role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, adminId))
      .get();
    expect(membership?.role).toBe('admin');
  });
});
