import type { LocaleCode, PublicPageRef } from '@systembook/schema';
import { sitePath } from './paths.js';

/**
 * Idioma na URL da doc pública (SYS-169). O padrão fica sem prefixo — os
 * links de antes dos idiomas continuam valendo — e os demais ficam sob
 * `/<código-em-minúsculas>/`. Doc pública (rotas e head), build estático (um
 * HTML por rota) e server usam estas funções; os caminhos saem sem a base,
 * como os de `sitePath`.
 */

/** Forma de uma tag BCP 47 (`en`, `pt-BR`, `zh-Hant-TW`), sem checar registro. */
const LOCALE_CODE = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i;

/**
 * `code` tem a forma de uma tag BCP 47. Só a forma: qual idioma existe é
 * decisão de quem configura. É a regra do server (idioma da interface) e a
 * que a config `locales` do estático vai usar (SYS-163).
 */
export function isLocaleCode(code: string): boolean {
  return code.length <= 35 && LOCALE_CODE.test(code);
}

/** Segmento do idioma na URL: o código em minúsculas (`pt-BR` → `pt-br`). */
export function localeSegment(code: LocaleCode): string {
  return code.toLowerCase();
}

/** Prefixo do idioma no caminho: `''` no padrão, `/pt-br` nos demais. */
export function localePrefix(locale: LocaleCode, defaultLocale: LocaleCode): string {
  return locale === defaultLocale ? '' : `/${localeSegment(locale)}`;
}

/**
 * Pasta dos dados de um idioma no site estático (SYS-177), relativa à pasta de
 * dados: `''` no padrão — os caminhos de antes dos idiomas — e
 * `locales/pt-br/` nos demais. Nela ficam navegação, landing, busca e
 * páginas; settings, previews e tokens, iguais em todo idioma, só na raiz.
 */
export function localeDataDir(locale: LocaleCode, defaultLocale: LocaleCode): string {
  return locale === defaultLocale ? '' : `locales/${localeSegment(locale)}/`;
}

/** Home da doc no idioma: `/` no padrão, `/pt-br` nos demais. */
export function localizedHomePath(locale: LocaleCode, defaultLocale: LocaleCode): string {
  return localePrefix(locale, defaultLocale) || '/';
}

/** Caminho da página (ou de uma tab dela) no idioma: `sitePath` com o prefixo. */
export function localizedSitePath(
  locale: LocaleCode,
  ref: PublicPageRef,
  defaultLocale: LocaleCode,
  tabSlug?: string,
): string {
  return `${localePrefix(locale, defaultLocale)}${sitePath(ref, tabSlug)}`;
}

export interface LocalePathMatch {
  /** Idioma do caminho; o padrão quando ele não tem prefixo de idioma. */
  locale: LocaleCode;
  /** O caminho sem o prefixo, sempre começando por `/` (`/` na home). */
  rest: string;
}

/**
 * Separa o prefixo de idioma de um caminho sem a base (`/pt-br/menu/…`) — só o
 * `pathname`, sem query nem hash, como o `useLocation` entrega. O
 * primeiro segmento só é idioma se for, exatamente, o segmento de um dos
 * `locales` que não o padrão — qualquer outro (inclusive o do padrão, que não
 * tem prefixo, e a forma com maiúsculas) segue como caminho: pode ser o slug
 * de um menu.
 */
export function splitLocalePrefix(
  path: string,
  locales: readonly LocaleCode[],
  defaultLocale: LocaleCode,
): LocalePathMatch {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const end = normalized.indexOf('/', 1);
  const first = normalized.slice(1, end === -1 ? undefined : end);
  const locale = first && locales.find((code) => code !== defaultLocale && localeSegment(code) === first);
  if (!locale) return { locale: defaultLocale, rest: normalized };
  return { locale, rest: end === -1 ? '/' : normalized.slice(end) };
}

/** Um `<link rel="alternate" hreflang>`: o idioma (ou `x-default`) e o caminho sem a base. */
export interface HreflangLink {
  hreflang: string;
  path: string;
}

/**
 * Links `hreflang` de uma página a partir de `PublishedPage.alternates`: um
 * por idioma publicado e `x-default` apontando para o padrão (quando a página
 * está publicada nele). Vazio com menos de dois idiomas — um idioma só não
 * tem alternativa a anunciar. Ordem: o padrão primeiro, os demais como vêm.
 * Os caminhos saem sem a base; quem emite a tag prefixa origem e base, porque
 * o `hreflang` pede URL absoluta.
 */
export function hreflangLinks(
  alternates: Readonly<Record<LocaleCode, PublicPageRef>>,
  defaultLocale: LocaleCode,
): HreflangLink[] {
  const codes = Object.keys(alternates);
  if (codes.length < 2) return [];
  const ordered = [...codes.filter((code) => code === defaultLocale), ...codes.filter((code) => code !== defaultLocale)];
  const links = ordered.map((code) => ({
    hreflang: code,
    path: localizedSitePath(code, alternates[code]!, defaultLocale),
  }));
  const fallback = alternates[defaultLocale];
  if (fallback) links.push({ hreflang: 'x-default', path: localizedSitePath(defaultLocale, fallback, defaultLocale) });
  return links;
}

/** Uma tag de idioma do `<head>`, com o caminho sem a base. */
export interface LocaleHeadLink {
  rel: 'alternate' | 'canonical';
  /** Só nos `alternate`. */
  hreflang?: string;
  path: string;
}

export interface LocaleHeadInput {
  /** `PublishedPage.alternates`. */
  alternates: Readonly<Record<LocaleCode, PublicPageRef>>;
  /** `PublishedPage.locale`: o idioma servido. */
  servedLocale: LocaleCode;
  /** Idioma da rota (o pedido). */
  routeLocale: LocaleCode;
  defaultLocale: LocaleCode;
  /** Tab da URL, se houver. */
  tabSlug?: string | null;
}

/**
 * Tags de idioma de uma rota de página (SYS-186), para a doc pública (SPA) e o
 * HTML do build estático. Numa página de **fallback** (servida ≠ rota), só o
 * `canonical` para a URL original — com a mesma tab, que é do conteúdo
 * servido —, sem `hreflang`: anunciar alternativas numa página não canônica
 * contradiz o canonical. Nas demais, os `hreflangLinks` — exceto numa tab, cujo
 * slug nos outros idiomas o contrato não conhece (anunciar as raízes das
 * páginas como alternativas da tab estaria errado).
 */
export function localeHeadLinks({
  alternates,
  servedLocale,
  routeLocale,
  defaultLocale,
  tabSlug,
}: LocaleHeadInput): LocaleHeadLink[] {
  if (servedLocale !== routeLocale) {
    const original = alternates[servedLocale];
    return original
      ? [{ rel: 'canonical', path: localizedSitePath(servedLocale, original, defaultLocale, tabSlug ?? undefined) }]
      : [];
  }
  if (tabSlug) return [];
  return hreflangLinks(alternates, defaultLocale).map(({ hreflang, path }) => ({ rel: 'alternate', hreflang, path }));
}
