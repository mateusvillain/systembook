import { eq, isNull } from 'drizzle-orm';
import type { Db } from './client.js';
import { sections } from './schema.js';

/**
 * Deriva um slug base a partir de um título (minúsculo, hifenizado, ASCII).
 * A unicidade é resolvida por `generateUniqueSectionSlug`.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos (marcas diacríticas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'secao';
}

/**
 * Slug único para uma section (TASK-52). Deriva do título e desambigua com
 * sufixo `-2`, `-3`… se já existir. `excludeId` permite recomputar para a
 * própria linha sem colidir consigo mesma.
 */
export function generateUniqueSectionSlug(db: Db, titulo: string, excludeId?: string): string {
  const base = slugify(titulo);
  const taken = new Set(
    db
      .select({ slug: sections.slug, id: sections.id })
      .from(sections)
      .all()
      .filter((r) => r.slug !== null && r.id !== excludeId)
      .map((r) => r.slug as string),
  );

  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Preenche o slug das sections que ainda não têm (linhas criadas antes da
 * migration 0008). Idempotente — só toca em `slug IS NULL`. Rodado no boot,
 * junto do seed, para que toda section fique endereçável na doc pública.
 */
export function backfillSectionSlugs(db: Db): { filled: number } {
  const pending = db.select().from(sections).where(isNull(sections.slug)).all();
  for (const section of pending) {
    const slug = generateUniqueSectionSlug(db, section.titulo, section.id);
    db.update(sections).set({ slug }).where(eq(sections.id, section.id)).run();
  }
  return { filled: pending.length };
}
