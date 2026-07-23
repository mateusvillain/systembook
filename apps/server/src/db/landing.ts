import type { Db } from './client.js';
import { DEFAULT_MENU_ID, pages, sections, tabs } from './schema.js';

/**
 * Página inicial customizável da doc pública (TASK-56). Em vez de um sistema de
 * armazenamento paralelo, reaproveitamos toda a máquina de tabs/blocks/revisions
 * (serialização da TASK-31, autosave da TASK-32, publish da TASK-34) por meio de
 * uma **section/page/tab reservadas** com ids sentinela fixos. A leve estranheza
 * de uma "página reservada" é aceita (nota do spec) — a alternativa duplicaria a
 * serialização de blocks.
 *
 * A section/page reservadas são **ocultadas** de `sections.list`/`listPublic`
 * (não aparecem na árvore de navegação nem no admin) e a página é **excluída da
 * indexação FTS** (`reindexPageFts`), já que a landing não é um resultado de
 * busca da documentação.
 */
export const LANDING_SECTION_ID = '__sb_landing_section__';
export const LANDING_PAGE_ID = '__sb_landing_page__';
export const LANDING_TAB_ID = '__sb_landing_tab__';

// Slug reservado (não-nulo) para a section: mantém o backfill de slugs (que só
// toca `slug IS NULL`) longe dela.
const LANDING_SLUG = '__sb_landing__';

/**
 * Garante que a section/page/tab reservadas da landing existem (idempotente,
 * chamado no boot depois das migrations). Sem conteúdo inicial: a landing só
 * ganha conteúdo quando um editor publica (senão o público vê o estado padrão).
 */
export function ensureLandingPage(db: Db): void {
  db.insert(sections)
    .values({
      id: LANDING_SECTION_ID,
      titulo: 'Página inicial',
      slug: LANDING_SLUG,
      menuId: DEFAULT_MENU_ID,
      ordem: -1,
    })
    .onConflictDoNothing()
    .run();

  db.insert(pages)
    .values({
      id: LANDING_PAGE_ID,
      sectionId: LANDING_SECTION_ID,
      titulo: 'Página inicial',
      slug: LANDING_SLUG,
      ordem: 0,
    })
    .onConflictDoNothing()
    .run();

  db.insert(tabs)
    .values({ id: LANDING_TAB_ID, pageId: LANDING_PAGE_ID, titulo: 'Página inicial', ordem: 0 })
    .onConflictDoNothing()
    .run();
}
