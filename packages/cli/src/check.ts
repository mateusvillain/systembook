import type { ResolvedConfig } from './config.js';
import { unsafeOutDir } from './build/index.js';
import { prepareSite } from './build/prepare.js';

export type CheckResult =
  | { ok: true; pages: number; images: number; previews: number }
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
  const all = unsafe ? [unsafe, ...problems] : problems;
  if (all.length) return { ok: false, problems: all };
  return {
    ok: true,
    pages: Object.keys(site.data.pages).length,
    images: site.images.length,
    previews: previews.reduce((n, p) => n + p.config.variants.length, 0),
  };
}
