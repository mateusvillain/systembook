import { unsafeOutDir, type ResolvedConfig } from './config.js';
import { prepareSite } from './build/prepare.js';

export type CheckResult =
  | {
      ok: true;
      pages: number;
      images: number;
      variants: number;
      /** `null` sem `tokens` na config; com config e nenhum token válido, `count: 0`. */
      tokens: { count: number; modes: string[] } | null;
      /**
       * Por idioma de tradução (SYS-171), quantas páginas têm tradução; só com
       * `locales.translations` na config.
       */
      translations?: { code: string; translated: number }[];
      warnings: string[];
    }
  | { ok: false; problems: string[]; warnings: string[] };

/**
 * `systembook check` (SYS-102): tudo o que o build valida — config, conteúdo,
 * navegação, links, imagens, logos, os pares de preview, os design tokens
 * (SYS-131) e as traduções (SYS-171: órfãos, slugs repetidos, links e
 * imagens por idioma) — sem gerar o site, para rodar em PR. Os problemas saem todos de
 * uma vez, com `arquivo:linha:coluna` (os de tokens, com `arquivo  caminho`);
 * os avisos não falham o comando.
 */
export async function checkSite(config: ResolvedConfig): Promise<CheckResult> {
  const unsafe = unsafeOutDir(config);
  const { site, previews, tokens, problems, warnings } = await prepareSite(config);
  if (unsafe) problems.unshift(unsafe);
  if (problems.length) return { ok: false, problems, warnings };
  const translations = config.locales.translations.map(({ code }) => ({
    code,
    translated: Object.values(site.locales[code]!.pages).filter((page) => page.locale === code).length,
  }));
  return {
    ok: true,
    ...(translations.length && { translations }),
    pages: Object.keys(site.data.pages).length,
    images: site.images.length,
    variants: previews.reduce((n, p) => n + p.config.variants.length, 0),
    tokens: config.tokens ? { count: tokens?.tokens.length ?? 0, modes: tokens?.modes ?? [] } : null,
    warnings,
  };
}
