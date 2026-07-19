import type { Block, BlockType } from '@systembook/schema';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './client.js';
import { BLOCK_TYPES, blocks } from './schema.js';

/**
 * Camada tipada sobre `blocks` (TASK-30): quem chama nunca vê o JSON cru de
 * `conteudo_json` — a (de)serialização e a validação de `tipo` acontecem só
 * aqui. Enforcement de `tipo` é de aplicação (ver nota em schema.ts).
 */

export const blockTypeSchema = z.enum(BLOCK_TYPES);

/** Conteúdo do bloco para um `tipo` específico, vindo do union compartilhado. */
export type BlockContentFor<T extends BlockType> = Extract<Block, { type: T }>['content'];

/** Linha de `blocks` com `conteudo` já parseado — union discriminada por `tipo`. */
export type BlockRecord = {
  [T in BlockType]: {
    id: string;
    tabId: string;
    tipo: T;
    conteudo: BlockContentFor<T>;
    ordem: number;
  };
}[BlockType];

/** Entrada de escrita (sem id) — o que a serialização da TASK-31 produz. */
export type NewBlock = {
  [T in BlockType]: { tabId: string; tipo: T; conteudo: BlockContentFor<T>; ordem: number };
}[BlockType];

function toRecord(row: typeof blocks.$inferSelect): BlockRecord {
  return {
    id: row.id,
    tabId: row.tabId,
    tipo: row.tipo,
    conteudo: JSON.parse(row.conteudoJson),
    ordem: row.ordem,
  } as BlockRecord;
}

/**
 * Substitui atomicamente todos os blocks de uma tab — caminho de escrita do
 * autosave (TASK-32). Não toca `revisions`: snapshot só no publish (TASK-34).
 */
export function replaceBlocksForTab(db: Db, tabId: string, inserts: readonly NewBlock[]): void {
  for (const block of inserts) blockTypeSchema.parse(block.tipo);
  db.transaction((tx) => {
    tx.delete(blocks).where(eq(blocks.tabId, tabId)).run();
    for (const block of inserts) {
      tx.insert(blocks)
        .values({
          tabId: block.tabId,
          tipo: block.tipo,
          conteudoJson: JSON.stringify(block.conteudo),
          ordem: block.ordem,
        })
        .run();
    }
  });
}

export function insertBlock<T extends BlockType>(
  db: Db,
  input: { tabId: string; tipo: T; conteudo: BlockContentFor<T>; ordem: number },
): BlockRecord {
  // Guarda de runtime além do tipo estático — chamadas vindas de fora do TS
  // (ex.: payloads de rede nos routers futuros) caem aqui de qualquer forma.
  blockTypeSchema.parse(input.tipo);
  const row = db
    .insert(blocks)
    .values({
      tabId: input.tabId,
      tipo: input.tipo,
      conteudoJson: JSON.stringify(input.conteudo),
      ordem: input.ordem,
    })
    .returning()
    .get();
  return toRecord(row);
}

export function listBlocksByTab(db: Db, tabId: string): BlockRecord[] {
  return db
    .select()
    .from(blocks)
    .where(eq(blocks.tabId, tabId))
    .orderBy(asc(blocks.ordem), asc(blocks.id))
    .all()
    .map(toRecord);
}
