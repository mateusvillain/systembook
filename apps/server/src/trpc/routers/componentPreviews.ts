import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getLatestPreview } from '../../db/componentPreviews.js';
import { resolvePreviewEntry } from '../../previews/entry.js';
import { PREVIEWS_URL_PREFIX } from '../../previews/serve.js';
import { protectedProcedure, router } from '../init.js';

/**
 * Resolução de previews de componente para o editor (TASK-47). `getLatest`
 * mapeia um par (componente, variante) para a URL servível do artefato mais
 * recente (rota da TASK-46), que o `component-embed` usa como `src` de iframe.
 *
 * protectedProcedure: é conteúdo do editor (admin + editor têm acesso, mesma
 * decisão de escopo de blocks/revisions).
 */
export const componentPreviewsRouter = router({
  getLatest: protectedProcedure
    .input(z.object({ componentName: z.string().min(1), variantId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = getLatestPreview(ctx.db, input.componentName, input.variantId);
      if (!row) return null;

      if (!ctx.previewsRoot) {
        // Não deve ocorrer em produção (index.ts sempre injeta env.PREVIEWS_PATH).
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'previewsRoot não configurado no contexto',
        });
      }

      // O registro pode existir sem os arquivos (volume recriado, artefato
      // removido). Nesse caso tratamos como "sem preview" → placeholder no
      // editor, nunca um iframe quebrado.
      const entry = await resolvePreviewEntry(ctx.previewsRoot, row.pathEstatico);
      if (!entry) return null;

      return {
        url: `${PREVIEWS_URL_PREFIX}${row.pathEstatico}/${entry}`,
        componentName: row.componentName,
        variantId: row.variantId,
        commitSha: row.commitSha,
        publicadoEm: row.publicadoEm.toISOString(),
      };
    }),
});
