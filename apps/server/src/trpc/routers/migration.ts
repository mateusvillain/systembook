import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { ImportResult, InstanceExport, InstanceImport } from '@systembook/schema';
import { UnknownNodeTypeError } from '../../blocks/serialize.js';
import { exportInstance } from '../../db/export.js';
import { isUniqueViolation } from '../../db/errors.js';
import { importInstance, ImportRejectedError } from '../../db/import.js';
import { MAX_LOGO_BYTES } from '../../db/settings.js';
import { MAX_MEDIA_BYTES } from '../../db/media.js';
import { migrationProcedure, router } from '../init.js';
import { slugSchema } from './pages.js';
import { HEX_COLOR } from './statusTags.js';

/** Teto do texto base64 antes de decodificar (rejeita o gigante sem materializar). */
const base64Of = (maxBytes: number) => z.string().max(Math.ceil((maxBytes * 4) / 3) + 1024);

const docSchema = z.object({ type: z.literal('doc'), content: z.array(z.looseObject({ type: z.string() })).optional() });
const titulo = z.string().trim().min(1);

const importSchema = z.object({
  version: z.literal(1),
  settings: z.object({
    nome: titulo,
    logo: z.object({ mime: z.string(), base64: base64Of(MAX_LOGO_BYTES) }).nullable(),
    logoDark: z.object({ mime: z.string(), base64: base64Of(MAX_LOGO_BYTES) }).nullable(),
    statusTags: z.array(z.object({ titulo, cor: HEX_COLOR })),
  }),
  landing: docSchema.nullable(),
  menus: z.array(
    z.object({
      titulo,
      slug: slugSchema,
      sections: z.array(
        z.object({
          titulo,
          slug: slugSchema,
          pages: z.array(
            z.object({
              titulo,
              slug: slugSchema,
              subtitulo: z.string().nullable(),
              overviewTitulo: z.string().nullable().optional(),
              status: z.string().nullable(),
              body: docSchema,
              tabs: z.array(z.object({ titulo, slug: slugSchema, doc: docSchema })),
            }),
          ),
        }),
      ),
    }),
  ),
  images: z.array(z.object({ ref: z.string().min(1), mime: z.string(), base64: base64Of(MAX_MEDIA_BYTES) })),
  overwrite: z.boolean(),
}) satisfies z.ZodType<InstanceImport>;

/**
 * Migração entre o modo CMS e o modo estático (Epic 5). Chamado pelo CLI
 * (`systembook export`/`import`) com um token de escopo `migration`.
 */
export const migrationRouter = router({
  export: migrationProcedure.query(({ ctx }): InstanceExport => exportInstance(ctx.db)),

  /**
   * Projeto do modo estático → instância (SYS-112). Publica tudo em nome do
   * admin dono do token. Conflitos de slug viram CONFLICT com um item por
   * linha na mensagem, para o CLI mostrar como estão.
   */
  import: migrationProcedure.input(importSchema).mutation(({ ctx, input }): ImportResult => {
    try {
      return importInstance(ctx.db, input as InstanceImport, ctx.tokenOwnerId);
    } catch (error) {
      if (error instanceof ImportRejectedError) {
        throw new TRPCError({ code: error.kind === 'conflict' ? 'CONFLICT' : 'BAD_REQUEST', message: error.message });
      }
      if (error instanceof UnknownNodeTypeError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
      // As checagens prévias cobrem os slugs; isto é a rede de segurança.
      if (isUniqueViolation(error)) throw new TRPCError({ code: 'CONFLICT', message: 'A slug in the project already exists in the instance' });
      throw error;
    }
  }),
});
