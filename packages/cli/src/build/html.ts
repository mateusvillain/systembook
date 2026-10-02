import type { Block, PageSnapshot, StaticSiteData } from '@systembook/schema';
import { parsePageKey, sitePath } from '@systembook/content/site';

/** Uma rota do site e o que vai no `<head>` dela. */
export interface RouteHead {
  /** Caminho sem a base, com `/` no início e sem no fim (`''` = landing). */
  path: string;
  title: string;
  description: string;
}

const DESCRIPTION_MAX = 160;

/** `RouteHead[]` de todas as rotas, na pasta de dados (o app lê ao navegar). */
export const HEADS_FILE = 'heads.json';

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
 * As rotas do site em ordem estável — landing, e cada página seguida das
 * suas tabs — com título e descrição: o subtítulo da página, ou o primeiro
 * parágrafo, ou o nome do design system.
 */
export function routeHeads(data: StaticSiteData, landingTitle: string | null): RouteHead[] {
  const name = data.settings.nomeDesignSystem;
  const routes: RouteHead[] = [
    {
      path: '',
      title: landingTitle && landingTitle !== name ? `${landingTitle} · ${name}` : name,
      description: firstParagraph(data.landing?.tabs[0]?.blocks) ?? name,
    },
  ];
  for (const key of Object.keys(data.pages).sort()) {
    const page = data.pages[key]!;
    const ref = parsePageKey(key);
    const description = page.subtitulo ?? firstParagraph(primaryBlocks(page.snapshot)) ?? name;
    routes.push({ path: sitePath(ref), title: `${page.titulo} · ${name}`, description });
    for (const tab of page.snapshot?.tabs ?? []) {
      if (tab.isPrimary) continue;
      routes.push({
        path: sitePath(ref, tab.tabId),
        title: `${tab.titulo} · ${page.titulo} · ${name}`,
        description: page.subtitulo ?? firstParagraph(tab.blocks) ?? description,
      });
    }
  }
  return routes;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** O `index.html` do bundle com o `<head>` de uma rota. */
export function renderHtml(template: string, head: Pick<RouteHead, 'title' | 'description'>): string {
  return template
    .replace('%SYSTEMBOOK_TITLE%', escapeHtml(head.title))
    .replace('%SYSTEMBOOK_DESCRIPTION%', escapeHtml(head.description));
}
