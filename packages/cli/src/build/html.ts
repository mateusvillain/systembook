import type { Block, LocaleCode, PageSnapshot, StaticSiteDataByLocale } from '@systembook/schema';
import { stripInlineMarkdown } from '@systembook/content/inline';
import {
  localeHeadLinks,
  localePrefix,
  localizedSitePath,
  parsePageKey,
  TOKENS_SEGMENT,
  type LocaleHeadLink,
} from '@systembook/content/site';

/** Uma rota do site e o que vai no `<head>` dela. */
export interface RouteMeta {
  /** Caminho sem a base, com `/` no início e sem no fim (`''` = landing). */
  path: string;
  title: string;
  description: string;
  /**
   * Idioma da rota (SYS-187) — o `<html lang>`. Só num site com mais de um
   * idioma: com um, as rotas são as de antes, byte a byte.
   */
  locale?: LocaleCode;
  /** `hreflang`/`canonical` da rota (`localeHeadLinks`), com caminhos sem a base; só com idiomas. */
  links?: LocaleHeadLink[];
}

const DESCRIPTION_MAX = 160;

/** O subtítulo sem marcadores, ou `undefined` se não houver (vazio cai no fallback). */
function subtitleText(subtitulo: string | null | undefined): string | undefined {
  return subtitulo ? stripInlineMarkdown(subtitulo) || undefined : undefined;
}

/** `RouteMeta[]` de todas as rotas, na pasta de dados (o app lê ao navegar). */
export const META_FILE = 'routes.json';

/** Texto puro de um conteúdo Tiptap (os nós `text`, em ordem). */
function plainText(value: unknown): string {
  if (Array.isArray(value)) return value.map(plainText).join('');
  if (value && typeof value === 'object') {
    const node = value as { type?: string; text?: unknown; content?: unknown; body?: unknown };
    if (node.type === 'text' && typeof node.text === 'string') return node.text;
    return plainText(node.content ?? node.body);
  }
  return '';
}

/** Primeiro parágrafo com texto, encurtado para uma meta description. */
function firstParagraph(blocks: Block[] | undefined): string | null {
  for (const block of blocks ?? []) {
    if (block.type !== 'paragraph') continue;
    const text = plainText(block.content).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : text;
  }
  return null;
}

const primaryBlocks = (snapshot: PageSnapshot | null) => snapshot?.tabs.find((t) => t.isPrimary)?.blocks;

/**
 * As rotas do site em ordem estável — por idioma, o padrão primeiro: landing,
 * cada página seguida das suas tabs e, com design tokens, a página Tokens
 * gerada (SYS-140) — com título e descrição: o subtítulo da página, ou o
 * primeiro parágrafo, ou o nome do design system. Num idioma de tradução, os
 * caminhos levam o prefixo dele e os slugs traduzidos (SYS-187), e cada página
 * leva as tags de idioma do `<head>`.
 */
export function routeMetas(
  locales: StaticSiteDataByLocale,
  landingTitles: Readonly<Record<LocaleCode, string | null>>,
): RouteMeta[] {
  const first = Object.values(locales)[0];
  if (!first) return [];
  const { settings } = first;
  const { defaultLocale } = settings;
  const multilingual = settings.locales.length > 1;
  const name = settings.nomeDesignSystem;
  const routes: RouteMeta[] = [];

  for (const { code } of settings.locales) {
    const data = locales[code]!;
    const prefix = localePrefix(code, defaultLocale);
    const route = (meta: RouteMeta, links?: LocaleHeadLink[]): RouteMeta =>
      multilingual ? { ...meta, locale: code, ...(links?.length && { links }) } : meta;
    const landingTitle = landingTitles[code] ?? null;
    routes.push(
      route({
        path: prefix,
        title: landingTitle && landingTitle !== name ? `${landingTitle} · ${name}` : name,
        description: firstParagraph(data.landing?.tabs[0]?.blocks) ?? name,
      }),
    );
    for (const key of Object.keys(data.pages).sort()) {
      const page = data.pages[key]!;
      const ref = parsePageKey(key);
      const head = (tabSlug?: string) =>
        localeHeadLinks({ alternates: page.alternates, servedLocale: page.locale, routeLocale: code, defaultLocale, tabSlug });
      const description = subtitleText(page.subtitulo) ?? firstParagraph(primaryBlocks(page.snapshot)) ?? name;
      routes.push(route({ path: localizedSitePath(code, ref, defaultLocale), title: `${page.titulo} · ${name}`, description }, head()));
      for (const tab of page.snapshot?.tabs ?? []) {
        if (tab.isPrimary) continue;
        routes.push(
          route(
            {
              path: localizedSitePath(code, ref, defaultLocale, tab.tabId),
              title: `${tab.titulo} · ${page.titulo} · ${name}`,
              description: subtitleText(page.subtitulo) ?? firstParagraph(tab.blocks) ?? description,
            },
            head(tab.tabId),
          ),
        );
      }
    }
    if (data.tokens) {
      routes.push(route({ path: `${prefix}/${TOKENS_SEGMENT}`, title: `Tokens · ${name}`, description: `Design tokens of ${name}.` }));
    }
  }
  return routes;
}

/** O `<head>` de uma URL que não é rota do site (o `404.html`). */
export function notFoundHead(name: string): Pick<RouteMeta, 'title' | 'description'> {
  return { title: `Page not found · ${name}`, description: name };
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * O `index.html` do bundle com o `<head>` de uma rota: título, descrição,
 * `<html lang>` (sem idioma na rota, `lang`) e as tags de idioma, com a base.
 */
export function renderHtml(
  template: string,
  head: Pick<RouteMeta, 'title' | 'description' | 'locale' | 'links'>,
  { base = '/', lang = 'en' }: { base?: string; lang?: LocaleCode } = {},
): string {
  const root = base.replace(/\/+$/, '');
  const links = (head.links ?? [])
    .map(({ rel, hreflang, path }) => {
      const attrs = hreflang ? ` hreflang="${escapeHtml(hreflang)}"` : '';
      return `    <link rel="${rel}"${attrs} href="${escapeHtml(`${root}${path}`)}" />\n`;
    })
    .join('');
  // Função de substituição: com string, `$&`/`$'` no texto seriam padrões do `replace`.
  return template
    .replace('%SYSTEMBOOK_LANG%', () => escapeHtml(head.locale ?? lang))
    .replace('%SYSTEMBOOK_TITLE%', () => escapeHtml(head.title))
    .replace('%SYSTEMBOOK_DESCRIPTION%', () => escapeHtml(head.description))
    .replace('</head>', () => `${links}</head>`);
}
