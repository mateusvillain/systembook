import type { Block, PageSnapshot } from '@systembook/schema';
import { asc, desc, inArray, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { diffSnapshots } from '../revisions/diff.js';
import { blocks, revisions, tabs } from './schema.js';

/**
 * "Esta página tem algo que ainda não foi publicado?" (SYS-67), em lote.
 *
 * **A definição é de conteúdo, não de horário.** `blocks` não tem timestamp — e
 * mesmo que tivesse, o autosave grava a cada pausa de digitação, inclusive
 * quando o texto voltou a ser exatamente o que já estava no ar (digitar e
 * apagar). Um carimbo de tempo diria "mudou" nesse caso; o leitor da árvore
 * quer saber se **publicar mudaria alguma coisa**. Por isso a comparação é o
 * mesmo `diffSnapshots` da SYS-59, que casa blocos por (tipo, conteúdo) e
 * ignora os ids — que o autosave recria a cada save e que, comparados
 * cruamente, marcariam toda página como divergente.
 */
export interface PageDraftStatus {
  pageId: string;
  /** Publicar produziria um resultado diferente do que está no ar. */
  hasUnpublishedChanges: boolean;
  /** Nunca publicada: não há revisão nenhuma para comparar. */
  neverPublished: boolean;
}

/**
 * Três consultas no total, independente de quantas páginas vêm na lista — o
 * critério da issue é justamente não fazer uma query por nó da árvore:
 * 1. a última revisão de cada página (janela sobre `revisions`, só os ids);
 * 2. os snapshots dessas revisões;
 * 3. tabs + blocks de todas as páginas de uma vez, agrupados em memória.
 */
export function getPagesDraftStatus(db: Db, pageIds: string[]): PageDraftStatus[] {
  if (pageIds.length === 0) return [];

  // 1+2. Última revisão por página. O desempate por `rowid` é o mesmo de
  // `listByPage`/`getLatestPublished`: `criado_em` tem resolução de segundo e
  // dois publishes seguidos empatam.
  const latest = db.all<{ pageId: string; snapshotJson: string }>(sql`
    SELECT page_id AS pageId, snapshot_json AS snapshotJson
    FROM (
      SELECT
        page_id,
        snapshot_json,
        ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY criado_em DESC, rowid DESC) AS rn
      FROM ${revisions}
      WHERE page_id IN ${pageIds}
    )
    WHERE rn = 1
  `);
  const publishedByPage = new Map(latest.map((row) => [row.pageId, row.snapshotJson]));

  // 3. Toda a estrutura de conteúdo das páginas pedidas numa varredura só.
  const rows = db
    .select({
      pageId: tabs.pageId,
      tabId: tabs.id,
      tabTitulo: tabs.titulo,
      tabIsPrimary: tabs.isPrimary,
      tabOrdem: tabs.ordem,
      blockId: blocks.id,
      tipo: blocks.tipo,
      conteudoJson: blocks.conteudoJson,
      blockOrdem: blocks.ordem,
    })
    .from(tabs)
    .leftJoin(blocks, sql`${blocks.tabId} = ${tabs.id}`)
    .where(inArray(tabs.pageId, pageIds))
    // Mesma ordenação de `buildPageSnapshot`: primária primeiro, depois as tabs
    // de usuário. Os dois lados da comparação precisam enxergar a mesma ordem.
    .orderBy(desc(tabs.isPrimary), asc(tabs.ordem), asc(tabs.id), asc(blocks.ordem))
    .all();

  const draftByPage = new Map<string, PageSnapshot>();
  const tabIndex = new Map<string, PageSnapshot['tabs'][number]>();

  for (const row of rows) {
    let snapshot = draftByPage.get(row.pageId);
    if (!snapshot) {
      snapshot = { tabs: [] };
      draftByPage.set(row.pageId, snapshot);
    }
    let tab = tabIndex.get(row.tabId);
    if (!tab) {
      tab = { tabId: row.tabId, titulo: row.tabTitulo, isPrimary: row.tabIsPrimary, blocks: [] };
      tabIndex.set(row.tabId, tab);
      snapshot.tabs.push(tab);
    }
    // `leftJoin`: tab sem nenhum bloco vem com as colunas de `blocks` nulas.
    if (row.blockId === null || row.tipo === null || row.conteudoJson === null) continue;
    tab.blocks.push({
      id: row.blockId,
      tabId: row.tabId,
      type: row.tipo,
      content: JSON.parse(row.conteudoJson),
      ordem: row.blockOrdem ?? 0,
    } as Block);
  }

  return pageIds.map((pageId) => {
    const draft = draftByPage.get(pageId) ?? { tabs: [] };
    const publishedJson = publishedByPage.get(pageId);

    if (publishedJson === undefined) {
      // Nunca publicada. Só conta como pendente se houver o que publicar: uma
      // página recém-criada, ainda em branco, não deve nascer com o indicador
      // ligado — não há nada nela que o leitor esteja deixando de ver.
      const hasContent = draft.tabs.some((tab) => tab.blocks.length > 0);
      return { pageId, hasUnpublishedChanges: hasContent, neverPublished: true };
    }

    const published = JSON.parse(publishedJson) as PageSnapshot;
    const diff = diffSnapshots(published, draft);
    // Olha o status das **tabs**, não só a contagem de blocos: uma aba criada
    // (ainda vazia) ou renomeada não mexe em bloco nenhum e mesmo assim muda o
    // que o leitor vê quando a página for publicada — é o tab bar dela.
    return {
      pageId,
      hasUnpublishedChanges: diff.tabs.some((tab) => tab.status !== 'unchanged'),
      neverPublished: false,
    };
  });
}
