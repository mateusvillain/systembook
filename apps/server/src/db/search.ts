import type { BlockType, PageSnapshot } from '@systembook/schema';
import { eq, sql } from 'drizzle-orm';
import type { Db, DbTx } from './client.js';
import { pages, sections } from './schema.js';

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
 * de todos os blocos heading/paragraph/list/callout/table de todas as tabs,
 * reduzindo o JSON Tiptap (com marks) a prosa pura.
 */
export function extractSearchableText(snapshot: PageSnapshot): string {
  const parts: string[] = [];
  for (const tab of snapshot.tabs) {
    for (const block of tab.blocks) {
      if (!SEARCHABLE_BLOCK_TYPES.has(block.type)) continue;
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
