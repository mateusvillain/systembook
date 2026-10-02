import { unsafeOutDir, type ResolvedConfig } from './config.js';
import { prepareSite } from './build/prepare.js';

export type CheckResult =
  | { ok: true; pages: number; images: number; variants: number }
  | { ok: false; problems: string[] };

/**
 * `systembook check` (SYS-102): tudo o que o build valida — config, conteúdo,
 * navegação, links, imagens, logos e os pares de preview — sem gerar o site,
 * para rodar em PR. Os problemas saem todos de uma vez, com
 * `arquivo:linha:coluna`.
 */
export async function checkSite(config: ResolvedConfig): Promise<CheckResult> {
  const unsafe = unsafeOutDir(config);
  const { site, previews, problems } = await prepareSite(config);
  if (unsafe) problems.unshift(unsafe);
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    pages: Object.keys(site.data.pages).length,
    images: site.images.length,
    variants: previews.reduce((n, p) => n + p.config.variants.length, 0),
  };
}
