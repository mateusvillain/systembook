import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from './client.js';
import { SETTINGS_ID, settings } from './schema.js';

/** Variantes de logo (SYS-39): a dark é opcional e cai na clara quando ausente. */
export type LogoVariant = 'light' | 'dark';

/**
 * Tipos aceitos no upload do logo. SVG entra porque é o formato natural de um
 * logo, mas exige cuidado no serving — ver `serveLogo` em `logo/serve.ts`.
 */
export const ALLOWED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;

/**
 * Teto de 512 KB. Um logo de sidebar tem ~120×21 — qualquer coisa acima disso
 * é engano ou abuso, e o blob mora no `.db`, que é copiado inteiro em todo
 * backup.
 */
export const MAX_LOGO_BYTES = 512 * 1024;

/** Materializa a linha única de configuração. Idempotente (roda no boot). */
export function ensureSettings(db: Db): void {
  db.insert(settings).values({ id: SETTINGS_ID }).onConflictDoNothing().run();
}

export function getSettings(db: Db) {
  ensureSettings(db);
  return db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get()!;
}

/** Hash curto do conteúdo — entra na URL e a torna imutável/cacheável. */
export function logoHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

/** Colunas de cada variante, para não espalhar o `if (variant === …)`. */
export function logoColumns(variant: LogoVariant) {
  return variant === 'dark'
    ? { blob: settings.logoDark, mime: settings.logoDarkMime, hash: settings.logoDarkHash }
    : { blob: settings.logo, mime: settings.logoMime, hash: settings.logoHash };
}

export function readLogo(
  db: Db,
  variant: LogoVariant,
): { bytes: Buffer; mime: string; hash: string } | null {
  const row = getSettings(db);
  const bytes = variant === 'dark' ? row.logoDark : row.logo;
  const mime = variant === 'dark' ? row.logoDarkMime : row.logoMime;
  const hash = variant === 'dark' ? row.logoDarkHash : row.logoHash;
  if (!bytes || !mime || !hash) return null;
  return { bytes: Buffer.from(bytes), mime, hash };
}
