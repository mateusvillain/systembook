import type { BlockType, PageSnapshot } from '@systembook/schema';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db, DbTx } from './client.js';
import { LANDING_PAGE_ID, LANDING_SECTION_ID } from './landing.js';
import { blocks, menus, pages, sections, tabs } from './schema.js';

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
 * Texto plano de **um** bloco. Extraído para fora do `extractSearchableText`
 * (SYS-63) porque a busca em rascunho lê linha a linha de `blocks`, sem
 * snapshot: as duas leituras precisam concordar sobre o que é "texto do
 * bloco", senão o mesmo conteúdo apareceria numa busca e não na outra.
 * Devolve string vazia para tipos sem prosa (code/image/embed).
 */
export function blockPlainText(tipo: BlockType, conteudo: unknown): string {
  if (!SEARCHABLE_BLOCK_TYPES.has(tipo)) return '';
  const parts: string[] = [];
  // dos-donts não tem `body`: o título é texto puro e a descrição é o
  // corpo rich-text aninhado (mesmo formato de conteúdo do callout).
  if (tipo === 'dos-donts') {
    const c = conteudo as { titulo?: string; descricao?: unknown };
    if (typeof c.titulo === 'string') parts.push(c.titulo);
    collectText(c.descricao, parts);
  } else {
    collectText((conteudo as { body?: unknown }).body, parts);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
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
      const text = blockPlainText(block.type, block.content);
      if (text) parts.push(text);
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
  /** Menu dono da seção (SYS-37): compõe a URL pública canônica do resultado. */
  menuSlug: string | null;
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
    menuSlug: string | null;
    snippet: string;
  }>(sql`
    SELECT
      f.page_id AS pageId,
      p.titulo AS pageTitulo,
      p.slug AS pageSlug,
      s.titulo AS sectionTitulo,
      s.slug AS sectionSlug,
      m.slug AS menuSlug,
      snippet(pages_fts, 3, char(2), char(3), '…', 12) AS snippet
    FROM pages_fts f
    JOIN pages p ON p.id = f.page_id
    JOIN sections s ON s.id = p.section_id
    JOIN menus m ON m.id = s.menu_id
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
  /**
   * Caminho completo até o item, do menu para baixo e **sem incluir o próprio
   * título** (SYS-63): `['Documentação', 'Componentes']` para uma página, mais
   * o título da página quando o resultado é uma tab. É o que permite decidir
   * entre dois resultados homônimos sem abrir os dois — `context` sozinho
   * (só o pai imediato) não distingue "Botão" em dois menus diferentes.
   */
  path: string[];
  /**
   * Onde o termo casou. `content` só aparece na busca de rascunho: o título
   * bate direto, o conteúdo precisa do trecho para justificar o resultado.
   */
  matchedIn: 'title' | 'content';
  /**
   * Trecho do rascunho com o termo delimitado por STX/ETX — os mesmos
   * delimitadores do `snippet` do FTS5 (ver {@link SearchResult.snippet}), para
   * o cliente reusar o mesmo destaque sem inventar um segundo formato.
   */
  snippet?: string;
}

// Neutraliza os curingas do LIKE no texto do usuário; usado com ESCAPE '\'.
function likePattern(q: string): string {
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

const STRUCTURE_PER_TYPE = 8;
/** Teto de páginas/tabs devolvidas pelo casamento em rascunho. */
const DRAFT_CONTENT_LIMIT = 8;
/**
 * Teto de **linhas lidas** na varredura de rascunho. O filtro final (dedupe por
 * página/tab e descarte de casamento que só existe no JSON) roda em memória, e
 * sem este limite um termo genérico — um "a" digitado no meio da palavra —
 * traria todos os blocos da instância para a memória antes de sobrar oito.
 * Folga de ~25× sobre o teto de resultados: cobre páginas com muitos blocos
 * casando o mesmo termo, sem transformar a busca numa leitura da base inteira.
 */
const DRAFT_SCAN_LIMIT = DRAFT_CONTENT_LIMIT * 25;
/** Caracteres de contexto de cada lado do termo no trecho de rascunho. */
const SNIPPET_RADIUS = 60;

/**
 * Trecho de `text` em volta da primeira ocorrência de `term`, com o termo
 * delimitado por STX/ETX — o mesmo formato do `snippet()` do FTS5, para o
 * cliente ter um único destaque a implementar. `null` quando o termo não
 * aparece no texto: é o que descarta os falsos positivos do LIKE sobre o JSON
 * cru (um `href`, um nome de atributo, um id de variante).
 */
function draftSnippet(text: string, term: string): string | null {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at === -1) return null;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + term.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return (
    prefix +
    text.slice(start, at) +
    SNIPPET_MATCH_OPEN +
    text.slice(at, at + term.length) +
    SNIPPET_MATCH_CLOSE +
    text.slice(at + term.length, end) +
    suffix
  );
}

/**
 * Casamento no **conteúdo em rascunho** (SYS-63): lê `blocks` — o estado atual
 * do editor —, não o índice FTS5, que só existe a partir do publish. É a
 * diferença que a issue pede: quem acabou de escrever algo e ainda não
 * publicou precisa achar de volta.
 *
 * Sem índice novo, de propósito. Manter um segundo FTS sincronizado com o
 * autosave custaria escrita em cada tecla (debounce à parte) para uma consulta
 * que roda com debounce, numa instância com milhares de blocos no pior caso. O
 * LIKE sobre `conteudo_json` faz a pré-seleção **no banco**; o JSON casado é
 * então reduzido a texto puro (`blockPlainText`) e o termo é reconferido ali —
 * é essa segunda passada que impede um `href` ou um nome de atributo de virar
 * resultado.
 *
 * Um resultado por página/tab: o primeiro bloco que casa já justifica o item, e
 * repetir a mesma página cinco vezes empurraria o resto da lista para fora.
 */
function searchDraftContent(
  db: Db,
  term: string,
  alreadyFound: Set<string>,
): StructureSearchResult[] {
  const pattern = likePattern(term);

  const rows = db
    .select({
      tipo: blocks.tipo,
      conteudoJson: blocks.conteudoJson,
      tabId: tabs.id,
      tabTitulo: tabs.titulo,
      tabIsPrimary: tabs.isPrimary,
      pageId: pages.id,
      pageTitulo: pages.titulo,
      sectionTitulo: sections.titulo,
      menuId: sections.menuId,
      menuTitulo: menus.titulo,
    })
    .from(blocks)
    .innerJoin(tabs, eq(tabs.id, blocks.tabId))
    .innerJoin(pages, eq(pages.id, tabs.pageId))
    .innerJoin(sections, eq(sections.id, pages.sectionId))
    .innerJoin(menus, eq(menus.id, sections.menuId))
    .where(
      and(
        ne(pages.id, LANDING_PAGE_ID),
        ne(sections.id, LANDING_SECTION_ID),
        sql`${blocks.conteudoJson} LIKE ${pattern} ESCAPE '\\'`,
      ),
    )
    // Ordem da árvore (não relevância): o corte do `LIMIT` fica determinístico,
    // e é a mesma ordem em que os resultados aparecem na navegação.
    .orderBy(asc(pages.ordem), asc(tabs.ordem), asc(blocks.ordem))
    .limit(DRAFT_SCAN_LIMIT)
    .all();

  const results: StructureSearchResult[] = [];
  const seen = new Set(alreadyFound);

  for (const row of rows) {
    if (results.length >= DRAFT_CONTENT_LIMIT) break;
    // O corpo da página é a tab primária: o resultado é a página, não uma aba.
    const key = row.tabIsPrimary ? `page:${row.pageId}` : `tab:${row.tabId}`;
    if (seen.has(key)) continue;

    const snippet = draftSnippet(blockPlainText(row.tipo, JSON.parse(row.conteudoJson)), term);
    if (snippet === null) continue;

    seen.add(key);
    results.push(
      row.tabIsPrimary
        ? {
            type: 'page',
            id: row.pageId,
            titulo: row.pageTitulo,
            menuId: row.menuId,
            pageId: row.pageId,
            context: row.sectionTitulo,
            path: [row.menuTitulo, row.sectionTitulo],
            matchedIn: 'content',
            snippet,
          }
        : {
            type: 'tab',
            id: row.tabId,
            titulo: row.tabTitulo,
            menuId: row.menuId,
            pageId: row.pageId,
            tabId: row.tabId,
            context: row.pageTitulo,
            path: [row.menuTitulo, row.sectionTitulo, row.pageTitulo],
            matchedIn: 'content',
            snippet,
          },
    );
  }

  return results;
}

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
    .map((m) => ({ type: 'menu', id: m.id, titulo: m.titulo, menuId: m.id, path: [], matchedIn: 'title' }));

  const sectionRows: StructureSearchResult[] = db
    .select({ id: sections.id, titulo: sections.titulo, menuId: sections.menuId, menuTitulo: menus.titulo })
    .from(sections)
    .innerJoin(menus, eq(menus.id, sections.menuId))
    .where(and(ne(sections.id, LANDING_SECTION_ID), sql`${sections.titulo} LIKE ${pattern} ESCAPE '\\'`))
    .orderBy(asc(sections.ordem), asc(sections.id))
    .limit(STRUCTURE_PER_TYPE)
    .all()
    .map((s) => ({
      type: 'section',
      id: s.id,
      titulo: s.titulo,
      menuId: s.menuId,
      context: s.menuTitulo,
      path: [s.menuTitulo],
      matchedIn: 'title',
    }));

  const pageRows: StructureSearchResult[] = db
    .select({
      id: pages.id,
      titulo: pages.titulo,
      menuId: sections.menuId,
      sectionTitulo: sections.titulo,
      menuTitulo: menus.titulo,
    })
    .from(pages)
    .innerJoin(sections, eq(sections.id, pages.sectionId))
    .innerJoin(menus, eq(menus.id, sections.menuId))
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
    .map((p) => ({
      type: 'page',
      id: p.id,
      titulo: p.titulo,
      menuId: p.menuId,
      pageId: p.id,
      context: p.sectionTitulo,
      path: [p.menuTitulo, p.sectionTitulo],
      matchedIn: 'title',
    }));

  const tabRows: StructureSearchResult[] = db
    .select({
      id: tabs.id,
      titulo: tabs.titulo,
      pageId: pages.id,
      pageTitulo: pages.titulo,
      menuId: sections.menuId,
      sectionTitulo: sections.titulo,
      menuTitulo: menus.titulo,
    })
    .from(tabs)
    .innerJoin(pages, eq(pages.id, tabs.pageId))
    .innerJoin(sections, eq(sections.id, pages.sectionId))
    .innerJoin(menus, eq(menus.id, sections.menuId))
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
      path: [t.menuTitulo, t.sectionTitulo, t.pageTitulo],
      matchedIn: 'title',
    }));

  // O que casou pelo título não repete como casamento de conteúdo: o título é
  // a razão mais forte, e ver a mesma página duas vezes na lista faz parecer
  // que são itens diferentes.
  const byTitle = new Set([
    ...pageRows.map((p) => `page:${p.pageId}`),
    ...tabRows.map((t) => `tab:${t.tabId}`),
  ]);

  return [
    ...menuRows,
    ...sectionRows,
    ...pageRows,
    ...tabRows,
    ...searchDraftContent(db, trimmed, byTitle),
  ];
}
