import type { Block, PageSnapshot } from '@systembook/schema';
import { asc, eq } from 'drizzle-orm';
import type { Db, DbTx } from './client.js';
import { listBlocksByTab, replaceBlocksForTabInTx, type BlockRecord, type NewBlock } from './blocks.js';
import { reindexPageFts } from './search.js';
import { revisions, tabs } from './schema.js';

export type RevisionRow = typeof revisions.$inferSelect;

function toBlock(record: BlockRecord): Block {
  return {
    id: record.id,
    tabId: record.tabId,
    type: record.tipo,
    content: record.conteudo,
    ordem: record.ordem,
  } as Block;
}

function toNewBlock(tabId: string, block: Block): NewBlock {
  return { tabId, tipo: block.type, conteudo: block.content, ordem: block.ordem } as NewBlock;
}

/**
 * Monta o `PageSnapshot` de uma página no momento atual — todas as tabs
 * (ordenadas) com todos os seus blocks (TASK-34). Aceita `Db` ou um `tx` já
 * aberto: o restore (TASK-36) precisa ler o estado recém-restaurado dentro da
 * mesma transação, antes de fazer commit.
 */
export function buildPageSnapshot(db: Db | DbTx, pageId: string): PageSnapshot {
  const pageTabs = db
    .select()
    .from(tabs)
    .where(eq(tabs.pageId, pageId))
    .orderBy(asc(tabs.ordem), asc(tabs.id))
    .all();

  return {
    tabs: pageTabs.map((tab) => ({
      tabId: tab.id,
      titulo: tab.titulo,
      blocks: listBlocksByTab(db, tab.id).map(toBlock),
    })),
  };
}

/** Ponto de escrita em `revisions` usado pelo publish (TASK-34). */
export function createRevision(
  db: Db,
  params: { pageId: string; autorId: string; mensagem?: string },
): RevisionRow {
  const snapshot = buildPageSnapshot(db, params.pageId);
  const revision = db
    .insert(revisions)
    .values({
      pageId: params.pageId,
      snapshotJson: JSON.stringify(snapshot),
      autorId: params.autorId,
      mensagem: params.mensagem,
    })
    .returning()
    .get();
  // Mantém o índice FTS5 em sincronia com o conteúdo publicado (TASK-53).
  reindexPageFts(db, params.pageId, snapshot);
  return revision;
}

export interface RestoreResult {
  revision: RevisionRow;
  /** tabIds do snapshot que não existem mais na página (tab deletada depois da revisão) — só os demais foram restaurados. */
  skippedTabIds: string[];
}

/**
 * Restaura o snapshot de `targetRevision` como conteúdo atual da página
 * (TASK-36): substitui os blocks de cada tab ainda existente pelo conteúdo do
 * snapshot e cria, na mesma transação, uma nova revisão de acompanhamento com
 * o estado pós-restore — o histórico continua um log append-only do que foi
 * publicado, nunca reescrevendo o passado.
 *
 * Decisão de tab drift (nota da TASK-36): tabs do snapshot que não existem
 * mais na página são puladas (não é erro) e devolvidas em `skippedTabIds`
 * para a UI avisar o usuário — restaurar o resto continua útil mesmo se a
 * estrutura da página mudou desde a revisão.
 */
export function restoreRevision(
  db: Db,
  params: { pageId: string; targetRevision: RevisionRow; autorId: string },
): RestoreResult {
  const snapshot = JSON.parse(params.targetRevision.snapshotJson) as PageSnapshot;

  return db.transaction((tx) => {
    const existingTabIds = new Set(
      tx
        .select({ id: tabs.id })
        .from(tabs)
        .where(eq(tabs.pageId, params.pageId))
        .all()
        .map((t) => t.id),
    );

    const skippedTabIds: string[] = [];
    for (const tab of snapshot.tabs) {
      if (!existingTabIds.has(tab.tabId)) {
        skippedTabIds.push(tab.tabId);
        continue;
      }
      replaceBlocksForTabInTx(
        tx,
        tab.tabId,
        tab.blocks.map((block) => toNewBlock(tab.tabId, block)),
      );
    }

    const restoredSnapshot = buildPageSnapshot(tx, params.pageId);
    const revision = tx
      .insert(revisions)
      .values({
        pageId: params.pageId,
        snapshotJson: JSON.stringify(restoredSnapshot),
        autorId: params.autorId,
        mensagem: `Restaurado da revisão de ${params.targetRevision.criadoEm.toISOString()}`,
      })
      .returning()
      .get();

    // Reindexa dentro da mesma transação, a partir do estado já restaurado
    // (TASK-53) — a busca reflete o conteúdo restaurado, não o anterior.
    reindexPageFts(tx, params.pageId, restoredSnapshot);

    return { revision, skippedTabIds };
  });
}
