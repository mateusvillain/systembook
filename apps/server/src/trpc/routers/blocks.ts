import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { listBlocksByTab, replaceBlocksForTab } from '../../db/blocks.js';
import { tabs } from '../../db/schema.js';
import {
  blocksToTiptapDoc,
  tiptapDocToBlocks,
  UnknownNodeTypeError,
  type TiptapDoc,
} from '../../blocks/serialize.js';
import { protectedProcedure, router } from '../init.js';

// Validação estrutural mínima do doc — os nós são validados de verdade na
// serialização (tipos desconhecidos → BAD_REQUEST abaixo).
const tiptapDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.looseObject({ type: z.string() })).optional(),
});

export const blocksRouter = router({
  getByTab: protectedProcedure
    .input(z.object({ tabId: z.string() }))
    .query(({ ctx, input }) => {
      const tab = ctx.db.select({ id: tabs.id }).from(tabs).where(eq(tabs.id, input.tabId)).get();
      if (!tab) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tab não encontrada' });

      const records = listBlocksByTab(ctx.db, input.tabId);
      // doc null = tab nunca salva; o editor abre vazio em vez de um doc
      // com zero nós (distinção útil para o autosave não gravar à toa).
      return { doc: records.length > 0 ? blocksToTiptapDoc(records) : null, blocks: records };
    }),

  // Caminho de escrita do autosave (TASK-32): substitui o rascunho da tab.
  // NÃO cria revisão — snapshot é exclusivo do publish (TASK-34).
  saveDraft: protectedProcedure
    .input(z.object({ tabId: z.string(), doc: tiptapDocSchema }))
    .mutation(({ ctx, input }) => {
      const tab = ctx.db.select({ id: tabs.id }).from(tabs).where(eq(tabs.id, input.tabId)).get();
      if (!tab) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tab não encontrada' });

      let inserts;
      try {
        inserts = tiptapDocToBlocks(input.doc as TiptapDoc, input.tabId);
      } catch (error) {
        if (error instanceof UnknownNodeTypeError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        }
        throw error;
      }
      replaceBlocksForTab(ctx.db, input.tabId, inserts);
      return { ok: true, blockCount: inserts.length };
    }),
});
