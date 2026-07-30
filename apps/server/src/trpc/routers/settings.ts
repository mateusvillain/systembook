import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  ALLOWED_LOGO_MIMES,
  getSettings,
  logoHash,
  MAX_LOGO_BYTES,
  type LogoVariant,
} from '../../db/settings.js';
import { SETTINGS_ID, settings } from '../../db/schema.js';
import { adminProcedure, publicProcedure, router } from '../init.js';

/** Prefixo das URLs de logo servidas fora do tRPC (binário, não JSON). */
export const LOGO_URL_PREFIX = '/api/logo/';

const variantSchema = z.enum(['light', 'dark']);

function logoUrl(variant: LogoVariant, hash: string | null): string | null {
  return hash ? `${LOGO_URL_PREFIX}${variant}/${hash}` : null;
}

/**
 * O `mime` declarado pelo cliente é o que voltamos no `Content-Type` do
 * serving, então confiar nele cegamente deixaria alguém servir HTML como se
 * fosse imagem, na nossa origem. A checagem de assinatura amarra o tipo
 * declarado ao conteúdo real.
 */
function contentMatchesMime(bytes: Buffer, mime: string): boolean {
  if (mime === 'image/png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === 'image/jpeg') {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  // SVG é texto: exige que o primeiro elemento seja `<svg` ou um prólogo XML.
  const head = bytes.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype svg');
}

/**
 * Identidade da instância (SYS-39): nome e logo do design system.
 *
 * `getPublic` é sem auth — a doc pública precisa dela em toda página. Tudo que
 * escreve é `adminProcedure`: identidade é configuração da instância, não
 * estrutura de conteúdo (que admin e editor dividem).
 */
export const settingsRouter = router({
  // Leitura pública: só o que a doc precisa, nunca os bytes do logo (que vêm
  // pela URL própria, cacheável, em vez de inflar todo payload de navegação).
  getPublic: publicProcedure.query(({ ctx }) => {
    const row = getSettings(ctx.db);
    return {
      nomeDesignSystem: row.nomeDesignSystem,
      logoUrl: logoUrl('light', row.logoHash),
      logoDarkUrl: logoUrl('dark', row.logoDarkHash),
    };
  }),

  get: adminProcedure.query(({ ctx }) => {
    const row = getSettings(ctx.db);
    return {
      nomeDesignSystem: row.nomeDesignSystem,
      logoUrl: logoUrl('light', row.logoHash),
      logoDarkUrl: logoUrl('dark', row.logoDarkHash),
      logoMime: row.logoMime,
      logoDarkMime: row.logoDarkMime,
    };
  }),

  setNome: adminProcedure
    .input(z.object({ nomeDesignSystem: z.string().min(1).max(80) }))
    .mutation(({ ctx, input }) => {
      getSettings(ctx.db); // materializa a linha antes do update
      ctx.db
        .update(settings)
        .set({ nomeDesignSystem: input.nomeDesignSystem, atualizadoEm: new Date() })
        .where(eq(settings.id, SETTINGS_ID))
        .run();
      return { ok: true };
    }),

  /**
   * Upload em base64 dentro do próprio tRPC, e não num endpoint multipart
   * separado como o de previews (TASK-43): lá o payload é um tar.gz de dezenas
   * de MB vindo do CI, aqui é um arquivo de no máximo 512 KB vindo de uma
   * sessão de admin. O overhead de ~33% do base64 não paga um segundo caminho
   * de auth e parsing.
   */
  uploadLogo: adminProcedure
    .input(
      z.object({
        variant: variantSchema,
        mime: z.enum(ALLOWED_LOGO_MIMES),
        // Teto no texto base64 antes de decodificar: rejeita o payload gigante
        // sem materializar o buffer.
        dataBase64: z.string().min(1).max(Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 1024),
      }),
    )
    .mutation(({ ctx, input }) => {
      const bytes = Buffer.from(input.dataBase64, 'base64');
      if (bytes.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'The file is empty or not valid base64' });
      }
      if (bytes.length > MAX_LOGO_BYTES) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `The logo must be at most ${MAX_LOGO_BYTES / 1024} KB`,
        });
      }
      if (!contentMatchesMime(bytes, input.mime)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The file content does not match the declared type',
        });
      }

      const hash = logoHash(bytes);
      getSettings(ctx.db);
      ctx.db
        .update(settings)
        .set(
          input.variant === 'dark'
            ? { logoDark: bytes, logoDarkMime: input.mime, logoDarkHash: hash, atualizadoEm: new Date() }
            : { logo: bytes, logoMime: input.mime, logoHash: hash, atualizadoEm: new Date() },
        )
        .where(eq(settings.id, SETTINGS_ID))
        .run();
      return { url: `${LOGO_URL_PREFIX}${input.variant}/${hash}` };
    }),

  removeLogo: adminProcedure
    .input(z.object({ variant: variantSchema }))
    .mutation(({ ctx, input }) => {
      getSettings(ctx.db);
      ctx.db
        .update(settings)
        .set(
          input.variant === 'dark'
            ? { logoDark: null, logoDarkMime: null, logoDarkHash: null, atualizadoEm: new Date() }
            : { logo: null, logoMime: null, logoHash: null, atualizadoEm: new Date() },
        )
        .where(eq(settings.id, SETTINGS_ID))
        .run();
      return { ok: true };
    }),
});
