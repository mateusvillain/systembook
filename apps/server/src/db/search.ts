import type { BlockType, PageSnapshot } from '@systembook/schema';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db, DbTx } from './client.js';
import { LANDING_PAGE_ID, LANDING_SECTION_ID } from './landing.js';
import { menus, pages, sections, tabs } from './schema.js';

/**
 * Busca full-text sobre o conteúdo publicado (TASK-53), usando a virtual table
 * FTS5 `pages_fts` (migration 0009). A tabela é indexada **por publicação**:
 * `pages.publish` (TASK-34) e `pages.restoreRevision` (TASK-36) reindexam a
 * página afetada a partir do snapshot recém-criado. Páginas nunca publicadas
 * jamais ganham uma linha aqui, então ficam naturalmente fora dos resultados.
 *
 * FTS5 vem compilado no better-sqlite3 por padrão (verificado no MVP). A tabela
 * não é declarada no schema Drizzle (virtual table); toda interação é via SQL
 * cru pela API `db.run`/`db.all`.
 */

// Só blocos com prosa entram no índice; code/image/component-embed não têm
// texto pesquisável útil (nota do spec da TASK-53).
const SEARCHABLE_BLOCK_TYPES = new Set<BlockType>([
  'heading',
  'paragraph',
  'list',
  'callout',
  'table',
  'dos-donts',
]);

/** Coleta recursivamente todo `text` de um nó/array Tiptap, ignorando marks. */
function collectText(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return;
  }
  if (node && typeof node === 'object') {
    const n = node as { text?: unknown; content?: unknown };
    if (typeof n.text === 'string') out.push(n.text);
    if (n.content !== undefined) collectText(n.content, out);
  }
}

/**
 * Extrai o texto plano pesquisável de um snapshot de página: concatena o texto
 * de todos os blocos heading/paragraph/list/callout/table/dos-donts de todas
 * as tabs, reduzindo o JSON Tiptap (com marks) a prosa pura.
 */
export function extractSearchableText(snapshot: PageSnapshot): string {
  const parts: string[] = [];
  for (const tab of snapshot.tabs) {
    for (const block of tab.blocks) {
      if (!SEARCHABLE_BLOCK_TYPES.has(block.type)) continue;
      // dos-donts não tem `body`: o título é texto puro e a descrição é o
      // corpo rich-text aninhado (mesmo formato de conteúdo do callout).
      if (block.type === 'dos-donts') {
        parts.push(block.content.titulo);
        collectText(block.content.descricao, parts);
        continue;
      }
      collectText((block.content as { body?: unknown }).body, parts);
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * (Re)indexa uma página no `pages_fts` a partir do snapshot publicado. FTS5 não
 * lida bem com UPDATE em todos os cenários, então fazemos delete+insert. Aceita
 * `Db` ou um `tx` já aberto (o restore reindexará dentro da própria transação).
 */
export function reindexPageFts(db: Db | DbTx, pageId: string, snapshot: PageSnapshot): void {
  // A landing (TASK-56) reusa a máquina de publish, mas não é conteúdo de
  // documentação pesquisável — fora do índice de busca.
  if (pageId === LANDING_PAGE_ID) return;

  const titles = db
    .select({ pageTitulo: pages.titulo, sectionTitulo: sections.titulo })
    .from(pages)
    .innerJoin(sections, eq(sections.id, pages.sectionId))
    .where(eq(pages.id, pageId))
    .get();
  if (!titles) return; // página sem seção resolvível — nada a indexar

  const conteudo = extractSearchableText(snapshot);
  db.run(sql`DELETE FROM pages_fts WHERE page_id = ${pageId}`);
  db.run(
    sql`INSERT INTO pages_fts (page_id, titulo, section_titulo, conteudo)
        VALUES (${pageId}, ${titles.pageTitulo ?? ''}, ${titles.sectionTitulo ?? ''}, ${conteudo})`,
  );
}

export interface SearchResult {
  pageId: string;
  pageTitulo: string;
  pageSlug: string;
  sectionTitulo: string;
  sectionSlug: string | null;
  /**
   * Trecho do conteúdo com os termos casados delimitados pelos caracteres de
   * controle STX (``, abre) e ETX (``, fecha) — não `<mark>`, para
   * o cliente conseguir escapar o texto do conteúdo (untrusted) e só então
   * envolver os trechos casados, sem risco de injeção de HTML.
   */
  snippet: string;
}

/** Delimitadores de destaque no `snippet` (ver {@link SearchResult.snippet}). */
export const SNIPPET_MATCH_OPEN = '';
export const SNIPPET_MATCH_CLOSE = '';

/**
 * Monta uma expressão MATCH segura do FTS5 a partir de texto livre do usuário:
 * tokeniza em letras/números, cita cada termo (neutraliza sintaxe FTS5 como
 * `"`, `(`, `*`, `AND`) e adiciona `*` para casamento por prefixo. Termos são
 * unidos por espaço (AND implícito no FTS5). Retorna `null` se não houver termo.
 */
function buildMatchExpression(q: string): string | null {
  const tokens = q.match(/[\p{L}\p{N}_]+/gu);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"*`).join(' ');
}

/**
 * Busca páginas publicadas cujo conteúdo indexado casa com `q`, ordenadas por
 * relevância (`rank` do FTS5). O JOIN com `pages`/`sections` também descarta
 * linhas órfãs de páginas deletadas (a virtual table não tem FK cascade).
 */
export function searchPublishedPages(db: Db, q: string, limit = 20): SearchResult[] {
  const match = buildMatchExpression(q);
  if (match === null) return [];

  const rows = db.all<{
    pageId: string;
    pageTitulo: string;
    pageSlug: string;
    sectionTitulo: string;
    sectionSlug: string | null;
    snippet: string;
  }>(sql`
    SELECT
      f.page_id AS pageId,
      p.titulo AS pageTitulo,
      p.slug AS pageSlug,
      s.titulo AS sectionTitulo,
      s.slug AS sectionSlug,
      snippet(pages_fts, 3, char(2), char(3), '…', 12) AS snippet
    FROM pages_fts f
    JOIN pages p ON p.id = f.page_id
    JOIN sections s ON s.id = p.section_id
    WHERE pages_fts MATCH ${match}
    ORDER BY rank
    LIMIT ${limit}
  `);

  return rows;
}

/**
 * Busca de **estrutura** para o painel admin (TASK-91). Diferente de
 * `searchPublishedPages` (FTS5, conteúdo publicado, `publicProcedure`), isto
 * casa **títulos** de menus/seções/páginas/tabs — incluindo rascunhos e
 * estrutura não publicada — e por isso só é servido por `protectedProcedure`.
 *
 * Match simples por substring (LIKE, sem FTS5): a estrutura de navegação tem
 * poucas linhas, então um `LIKE '%q%'` por entidade é suficiente e barato. O
 * LIKE do SQLite é case-insensitive para ASCII; acentos não são dobrados
 * (limitação aceita — a busca de conteúdo cobre o texto real). As linhas
 * reservadas da landing (TASK-56) e a tab primária/"corpo" (TASK-65, que não é
 * uma aba visível ao usuário) ficam de fora.
 */
export type StructureSearchType = 'menu' | 'section' | 'page' | 'tab';

export interface StructureSearchResult {
  type: StructureSearchType;
  id: string;
  titulo: string;
  /** Menu dono do resultado — o cliente o ativa ao selecionar (TASK-85/86). */
  menuId: string;
  /** Página a abrir no editor (a própria página, ou a página-mãe de uma tab). */
  pageId?: string;
  /** Tab a abrir, quando o resultado é uma aba de usuário. */
  tabId?: string;
  /** Rótulo de contexto (breadcrumb curto): menu, seção ou página-mãe. */
  context?: string;
}

// Neutraliza os curingas do LIKE no texto do usuário; usado com ESCAPE '\'.
function likePattern(q: string): string {
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

const STRUCTURE_PER_TYPE = 8;

export function searchStructure(db: Db, q: string): StructureSearchResult[] {
  const trimmed = q.trim();
  if (trimmed.length === 0) return [];
  const pattern = likePattern(trimmed);

  const menuRows: StructureSearchResult[] = db
    .select({ id: menus.id, titulo: menus.titulo })
    .from(menus)
    .where(sql`${menus.titulo} LIKE ${pattern} ESCAPE '\\'`)
    .orderBy(asc(menus.ordem), asc(menus.id))
    .limit(STRUCTURE_PER_TYPE)
    .all()
    .map((m) => ({ type: 'menu', id: m.id, titulo: m.titulo, menuId: m.id }));

  const sectionRows: StructureSearchResult[] = db
    .select({ id: sections.id, titulo: sections.titulo, menuId: sections.menuId, menuTitulo: menus.titulo })
    .from(sections)
    .innerJoin(menus, eq(menus.id, sections.menuId))
    .where(and(ne(sections.id, LANDING_SECTION_ID), sql`${sections.titulo} LIKE ${pattern} ESCAPE '\\'`))
    .orderBy(asc(sections.ordem), asc(sections.id))
    .limit(STRUCTURE_PER_TYPE)
    .all()
    .map((s) => ({ type: 'section', id: s.id, titulo: s.titulo, menuId: s.menuId, context: s.menuTitulo }));

  const pageRows: StructureSearchResult[] = db
    .select({ id: pages.id, titulo: pages.titulo, menuId: sections.menuId, sectionTitulo: sections.titulo })
    .from(pages)
    .innerJoin(sections, eq(sections.id, pages.sectionId))
    .where(
      and(
        ne(pages.id, LANDING_PAGE_ID),
        ne(sections.id, LANDING_SECTION_ID),
        sql`${pages.titulo} LIKE ${pattern} ESCAPE '\\'`,
      ),
    )
    .orderBy(asc(pages.ordem), asc(pages.id))
    .limit(STRUCTURE_PER_TYPE)
    .all()
    .map((p) => ({ type: 'page', id: p.id, titulo: p.titulo, menuId: p.menuId, pageId: p.id, context: p.sectionTitulo }));

  const tabRows: StructureSearchResult[] = db
    .select({ id: tabs.id, titulo: tabs.titulo, pageId: pages.id, pageTitulo: pages.titulo, menuId: sections.menuId })
    .from(tabs)
    .innerJoin(pages, eq(pages.id, tabs.pageId))
    .innerJoin(sections, eq(sections.id, pages.sectionId))
    .where(
      and(
        eq(tabs.isPrimary, false),
        ne(pages.id, LANDING_PAGE_ID),
        ne(sections.id, LANDING_SECTION_ID),
        sql`${tabs.titulo} LIKE ${pattern} ESCAPE '\\'`,
      ),
    )
    .orderBy(asc(tabs.ordem), asc(tabs.id))
    .limit(STRUCTURE_PER_TYPE)
    .all()
    .map((t) => ({
      type: 'tab',
      id: t.id,
      titulo: t.titulo,
      menuId: t.menuId,
      pageId: t.pageId,
      tabId: t.id,
      context: t.pageTitulo,
    }));

  return [...menuRows, ...sectionRows, ...pageRows, ...tabRows];
}
