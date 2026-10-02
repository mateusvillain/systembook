import MiniSearch, { type AsPlainObject, type Options } from 'minisearch';
import type { BlockType, PageSnapshot, PublicSearchResult, StaticSiteData } from '@systembook/schema';
import { parsePageKey } from './paths.js';

/**
 * Busca da doc pública no modo estático (SYS-101): o build gera um índice
 * MiniSearch a partir do texto dos blocos (`search.json`) e a
 * `staticDataSource` o consulta no navegador, devolvendo o mesmo
 * `PublicSearchResult` do modo CMS — inclusive o snippet com os termos entre
 * STX/ETX que a `SearchBox` destaca.
 *
 * A regra de "texto do bloco" é a canônica: o server (`apps/server/src/db/search.ts`)
 * tem uma cópia, travada por teste de paridade, para os dois modos acharem a
 * mesma coisa.
 */

// Só blocos com prosa entram no índice; code/image/component-embed não têm
// texto pesquisável útil.
const SEARCHABLE_BLOCK_TYPES = new Set<BlockType>(['heading', 'paragraph', 'list', 'callout', 'table', 'dos-donts']);

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

/** Texto plano de um bloco; vazio para tipos sem prosa (code/image/embed). */
export function blockPlainText(tipo: BlockType, conteudo: unknown): string {
  if (!SEARCHABLE_BLOCK_TYPES.has(tipo)) return '';
  const parts: string[] = [];
  // dos-donts não tem `body`: o título é texto puro e a descrição é o corpo
  // rich-text aninhado (mesmo formato do callout).
  if (tipo === 'dos-donts') {
    const c = conteudo as { titulo?: string; descricao?: unknown };
    if (typeof c.titulo === 'string') parts.push(c.titulo);
    collectText(c.descricao, parts);
  } else {
    collectText((conteudo as { body?: unknown }).body, parts);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Texto pesquisável de um snapshot: o de todos os blocos de todas as tabs. */
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

/** Delimitadores de destaque no `snippet`, os mesmos do FTS5 do server. */
const MATCH_OPEN = '\u0002';
const MATCH_CLOSE = '\u0003';
/** Tamanho do trecho, em termos — o mesmo `12` do `snippet()` do FTS5. */
const SNIPPET_TOKENS = 12;
/** Teto de resultados, como o `LIMIT` da busca do server. */
const MAX_RESULTS = 20;

interface SearchDocument {
  id: string;
  pageTitulo: string;
  sectionTitulo: string;
  text: string;
}

/**
 * Termos como o tokenizer `unicode61` do FTS5 os vê: letras e números (o `_`
 * separa), minúsculos e sem acento. O texto vai para NFC antes: em NFD, as
 * marcas de acento ficam fora da classe e partiriam "ação" no meio.
 */
const TOKEN = /[\p{L}\p{N}]+/gu;
const tokens = (text: string) => text.normalize('NFC').match(TOKEN) ?? [];
const normalize = (term: string) => term.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const OPTIONS: Options<SearchDocument> = {
  fields: ['pageTitulo', 'sectionTitulo', 'text'],
  storeFields: ['pageTitulo', 'sectionTitulo', 'text'],
  tokenize: tokens,
  processTerm: normalize,
  // Sem boost: o `rank` do FTS5 pesa as colunas por igual.
  searchOptions: { prefix: true, combineWith: 'AND' },
};

/** O índice serializado (`search.json`). */
export type SearchIndexJson = AsPlainObject;

/**
 * O índice de busca do site. Guarda o texto de cada página além do índice:
 * é dele que sai o trecho do resultado.
 */
export function createSearchIndex(data: StaticSiteData): SearchIndexJson {
  const index = new MiniSearch<SearchDocument>(OPTIONS);
  for (const key of Object.keys(data.pages).sort()) {
    const page = data.pages[key]!;
    const section = sectionOf(data, key);
    index.add({
      id: key,
      pageTitulo: page.titulo,
      sectionTitulo: section?.titulo ?? '',
      text: page.snapshot ? extractSearchableText(page.snapshot).normalize('NFC') : '',
    });
  }
  return index.toJSON();
}

function sectionOf(data: StaticSiteData, key: string) {
  const { menuSlug, sectionSlug } = parsePageKey(key);
  return data.nav.find((m) => m.slug === menuSlug)?.sections.find((s) => s.slug === sectionSlug);
}

/** Índice carregado de `search.json`, pronto para consultas. */
export type SearchIndex = MiniSearch<SearchDocument>;

export function loadSearchIndex(json: SearchIndexJson): SearchIndex {
  return MiniSearch.loadJS<SearchDocument>(json, OPTIONS);
}

/**
 * Busca como a do server: todos os termos precisam casar (prefixo), por
 * relevância, com o trecho do conteúdo em volta do primeiro termo encontrado.
 */
export function querySearchIndex(index: SearchIndex, q: string): PublicSearchResult[] {
  const terms = tokens(q).map(normalize);
  if (!terms.length) return [];
  return index
    .search(terms.join(' '))
    .slice(0, MAX_RESULTS)
    .map((hit) => {
      const { menuSlug, sectionSlug, pageSlug } = parsePageKey(String(hit.id));
      return {
        pageId: String(hit.id),
        pageTitulo: hit.pageTitulo as string,
        pageSlug,
        sectionTitulo: hit.sectionTitulo as string,
        sectionSlug,
        menuSlug,
        snippet: snippet(hit.text as string, terms),
      };
    });
}

/**
 * Trecho de até 12 termos, com os casados entre STX/ETX e `…` onde o texto
 * foi cortado — o formato do `snippet()` do FTS5. Como lá, a janela é a que
 * reúne mais termos distintos casados (no empate, a primeira), começando um
 * pouco antes deles. Sem termo no conteúdo (casou pelo título), o começo do texto.
 */
export function snippet(rawText: string, terms: string[]): string {
  const text = rawText.normalize('NFC');
  const found = [...text.matchAll(TOKEN)];
  if (!found.length) return '';
  const termOf = (word: string) => terms.findIndex((term) => normalize(word).startsWith(term));

  let start = 0;
  let best = 0;
  for (let i = 0; i < found.length; i++) {
    if (termOf(found[i]![0]) < 0) continue;
    const from = Math.max(0, Math.min(i - 2, found.length - SNIPPET_TOKENS));
    const distinct = new Set(found.slice(from, from + SNIPPET_TOKENS).map((t) => termOf(t[0])).filter((t) => t >= 0)).size;
    if (distinct > best) [best, start] = [distinct, from];
  }
  const end = Math.min(found.length, start + SNIPPET_TOKENS);

  let out = start > 0 ? '…' : '';
  let cursor = found[start]!.index;
  for (let i = start; i < end; i++) {
    const token = found[i]!;
    out += text.slice(cursor, token.index);
    out += termOf(token[0]) >= 0 ? `${MATCH_OPEN}${token[0]}${MATCH_CLOSE}` : token[0];
    cursor = token.index + token[0].length;
  }
  return end < found.length ? `${out}…` : out + text.slice(cursor);
}
