import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  getLatestPreview,
  listComponentNames,
  listVariantIds,
} from '../../db/componentPreviews.js';
import { readPreviewConfig, resolvePreviewEntry } from '../../previews/entry.js';
import { PREVIEWS_URL_PREFIX } from '../../previews/serve.js';
import { protectedProcedure, publicProcedure, router } from '../init.js';

/**
 * Resolução de previews de componente para o editor (TASK-47). `getLatest`
 * mapeia um par (componente, variante) para a URL servível do artefato mais
 * recente (rota da TASK-46), que o `component-embed` usa como `src` de iframe.
 *
 * protectedProcedure: é conteúdo do editor (admin + editor têm acesso, mesma
 * decisão de escopo de blocks/revisions).
 */
export const componentPreviewsRouter = router({
  /** Componentes selecionáveis no picker (TASK-48) — só os já publicados. */
  listComponents: protectedProcedure.query(({ ctx }) => listComponentNames(ctx.db)),

  /** Variantes publicadas de um componente (segundo passo do picker). */
  listVariants: protectedProcedure
    .input(z.object({ componentName: z.string().min(1) }))
    .query(({ ctx, input }) => listVariantIds(ctx.db, input.componentName)),

  // publicProcedure: o preview resolvido (URL + config) é conteúdo público —
  // o mesmo artefato já é servido sem auth pela rota /previews/* (TASK-46) e o
  // component-embed precisa dele na doc pública deslogada (TASK-50).
  getLatest: publicProcedure
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

      // PreviewConfig co-localizado (TASK-49) — dá os `controls` ao painel do
      // admin sem um segundo round-trip ao artefato estático. `null` em
      // artefatos antigos (pré-TASK-49): o painel de controles some.
      const config = await readPreviewConfig(ctx.previewsRoot, row.pathEstatico, entry);

      return {
        url: `${PREVIEWS_URL_PREFIX}${row.pathEstatico}/${entry}`,
        componentName: row.componentName,
        variantId: row.variantId,
        commitSha: row.commitSha,
        publicadoEm: row.publicadoEm.toISOString(),
        config,
      };
    }),
});
