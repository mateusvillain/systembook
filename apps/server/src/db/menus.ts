import { eq, isNull } from 'drizzle-orm';
import type { Db } from './client.js';
import { DEFAULT_MENU_ID, menus } from './schema.js';

export const DEFAULT_MENU_TITLE = 'Documentação';
const DEFAULT_MENU_SLUG = 'documentacao';

/**
 * Materializa o menu que recebe todas as sections existentes antes da Fase 10.
 * O `ON CONFLICT DO NOTHING` torna a operação segura no boot, nos testes e em
 * reinicializações; sections sem `menu_id` recebem DEFAULT_MENU_ID pela
 * migration/schema e, portanto, passam a ter um pai válido.
 */
export function ensureDefaultMenu(db: Db): void {
  db.insert(menus)
    .values({
      id: DEFAULT_MENU_ID,
      titulo: DEFAULT_MENU_TITLE,
      slug: DEFAULT_MENU_SLUG,
      ordem: 0,
    })
    .onConflictDoNothing()
    .run();
}

/** Deriva o slug base dos menus, seguindo a convenção das sections. */
export function slugifyMenu(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'menu';
}

/** Resolve colisões de slug globalmente entre menus (`-2`, `-3`…). */
export function generateUniqueMenuSlug(db: Db, titulo: string, excludeId?: string): string {
  const base = slugifyMenu(titulo);
  const taken = new Set(
    db
      .select({ slug: menus.slug, id: menus.id })
      .from(menus)
      .all()
      .filter((menu) => menu.slug !== null && menu.id !== excludeId)
      .map((menu) => menu.slug as string),
  );

  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Preenche slugs de menus legados, preservando a mesma estratégia das sections. */
export function backfillMenuSlugs(db: Db): { filled: number } {
  const pending = db.select().from(menus).where(isNull(menus.slug)).all();
  for (const menu of pending) {
    db.update(menus)
      .set({ slug: generateUniqueMenuSlug(db, menu.titulo, menu.id) })
      .where(eq(menus.id, menu.id))
      .run();
  }
  return { filled: pending.length };
}
