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
 * decisão de quem configura. A mesma regra vale na config do estático e no
 * server.
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
 * Separa o prefixo de idioma de um caminho sem a base (`/pt-br/menu/…`). O
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
