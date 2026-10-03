import { asc, desc, ne, sql } from 'drizzle-orm';
import type { ExportedFile, ExportedMenu, InstanceExport, PageSnapshot, UnpublishedPageRef } from '@systembook/schema';
import type { Db } from './client.js';
import { LANDING_PAGE_ID, LANDING_SECTION_ID } from './landing.js';
import { getSettings } from './settings.js';
import { menus, pages, revisions, sections, statusTags } from './schema.js';

/**
 * Export da instância para o modo estático (SYS-110): a árvore de navegação
 * com a última revisão **publicada** de cada página, a landing, o nome, os
 * logos e as status tags. Páginas nunca publicadas não entram (o modo estático
 * não tem rascunho) e vão listadas em `unpublished` para o CLI avisar.
 *
 * Imagens de bloco e de cover não são arquivos da instância: o CMS guarda só a
 * URL, que vai como está no snapshot. Os logos moram no banco e seguem
 * embutidos em base64.
 */
export function exportInstance(db: Db): InstanceExport {
  // Última revisão de cada página, com o mesmo desempate do
  // `revisions.getLatestPublished` (criado_em, depois rowid).
  const latest = new Map<string, PageSnapshot>();
  const rows = db
    .select({ pageId: revisions.pageId, snapshotJson: revisions.snapshotJson })
    .from(revisions)
    .orderBy(desc(revisions.criadoEm), desc(sql`${revisions}.rowid`))
    .all();
  for (const row of rows) {
    if (!latest.has(row.pageId)) latest.set(row.pageId, JSON.parse(row.snapshotJson) as PageSnapshot);
  }

  const tags = db.select().from(statusTags).orderBy(asc(statusTags.ordem), asc(statusTags.id)).all();
  const tagTitle = new Map(tags.map((tag) => [tag.id, tag.titulo]));

  const pageRows = db
    .select()
    .from(pages)
    .where(ne(pages.id, LANDING_PAGE_ID))
    .orderBy(asc(pages.ordem), asc(pages.id))
    .all();
  const sectionRows = db
    .select()
    .from(sections)
    .where(ne(sections.id, LANDING_SECTION_ID))
    .orderBy(asc(sections.ordem), asc(sections.id))
    .all();
  const menuRows = db.select().from(menus).orderBy(asc(menus.ordem), asc(menus.id)).all();

  const unpublished: UnpublishedPageRef[] = [];
  const exportedMenus: ExportedMenu[] = menuRows.map((menu) => {
    const menuSlug = menu.slug ?? menu.id;
    return {
      titulo: menu.titulo,
      slug: menuSlug,
      ordem: menu.ordem,
      sections: sectionRows
        .filter((section) => section.menuId === menu.id)
        .map((section) => {
          const sectionSlug = section.slug ?? section.id;
          const sectionPages = pageRows.filter((page) => page.sectionId === section.id);
          for (const page of sectionPages) {
            if (!latest.has(page.id)) {
              unpublished.push({ menu: menuSlug, section: sectionSlug, slug: page.slug, titulo: page.titulo });
            }
          }
          return {
            titulo: section.titulo,
            slug: sectionSlug,
            ordem: section.ordem,
            pages: sectionPages
              .filter((page) => latest.has(page.id))
              .map((page) => ({
                titulo: page.titulo,
                slug: page.slug,
                subtitulo: page.subtitulo,
                ordem: page.ordem,
                status: page.statusTagId ? (tagTitle.get(page.statusTagId) ?? null) : null,
                snapshot: latest.get(page.id)!,
              })),
          };
        }),
    };
  });

  const settingsRow = getSettings(db);
  const file = (bytes: Buffer | null, mime: string | null): ExportedFile | null =>
    bytes && mime ? { mime, base64: Buffer.from(bytes).toString('base64') } : null;

  return {
    version: 1,
    settings: {
      nome: settingsRow.nomeDesignSystem,
      logo: file(settingsRow.logo, settingsRow.logoMime),
      logoDark: file(settingsRow.logoDark, settingsRow.logoDarkMime),
      statusTags: tags.map((tag) => ({ titulo: tag.titulo, cor: tag.cor })),
    },
    landing: latest.get(LANDING_PAGE_ID) ?? null,
    menus: exportedMenus,
    unpublished,
  };
}
