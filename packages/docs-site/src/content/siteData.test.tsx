// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getSchema } from '@tiptap/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocsDataSource, PageSnapshot, StaticSiteData } from '@systembook/schema';
import { buildContentTree, buildSiteData, pageKey } from '@systembook/content';
import { blocksToTiptapDoc } from './blocksToTiptapDoc.js';
import { contentExtensions } from './extensions.js';
import { DocsDataSourceProvider } from './dataSource.js';
import { createDocsRoute } from '../public/createDocsRoute.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Os dados do site estático (SYS-96) são o que a doc pública vai ler no modo
 * estático. Aqui eles são gerados de um projeto fixture e conferidos do lado do
 * renderer: cada snapshot é válido no schema real, e a doc pública montada
 * sobre eles (com uma fonte em memória, prévia do `staticDataSource`)
 * mostra navegação, páginas, tabs e os links reescritos.
 */
const page = (title: string, body: string, extra = '') => `---\ntitle: ${title}\n${extra}---\n\n${body}\n`;
const FILES: Record<string, string> = {
  'index.mdx': '# Acme\n\nComece pela [paleta](foundation/color/palette.mdx).',
  'foundation/color/palette.mdx': page('Palette', '## Cores\n\n| Token | Uso |\n| --- | :---: |\n| `--primary` | **Ação** |\n\n![Paleta](./p.png "Legenda")', 'order: 1\n'),
  'foundation/color/tokens/index.mdx': page(
    'Tokens',
    '<Callout variant="tip">\n  Veja o [uso](./usage.mdx).\n\n  <ComponentEmbed component="Button" variant="primary" />\n</Callout>',
  ),
  'foundation/color/tokens/usage.mdx': page('Uso', '1. um\n   - dois\n\n```ts\nconst a = 1\n```'),
  'components/actions/button.mdx': page(
    'Button',
    '<DosDonts variant="do" title="Verbo" coverComponent="Button" coverVariant="primary">\n  Use <u>verbos</u>.\n</DosDonts>',
  ),
};

const tree = buildContentTree(Object.entries(FILES).map(([path, source]) => ({ path, source })));
const { data, diagnostics } = buildSiteData(tree, {
  settings: { nomeDesignSystem: 'Acme DS', logoUrl: null, logoDarkUrl: null },
  base: '/',
});

function snapshots(site: StaticSiteData): [string, PageSnapshot][] {
  return [
    ...(site.landing ? [['landing', site.landing] as [string, PageSnapshot]] : []),
    ...Object.entries(site.pages).map(([key, p]) => [key, p.snapshot!] as [string, PageSnapshot]),
  ];
}

describe('dados do site estático ↔ schema do conteúdo', () => {
  it('conteúdo e dados sem diagnósticos', () => {
    expect(tree.diagnostics).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('cada tab de cada snapshot é válida no schema e já normalizada', () => {
    const schema = getSchema(contentExtensions);
    const checked: string[] = [];
    for (const [key, snapshot] of snapshots(data)) {
      for (const tab of snapshot.tabs) {
        const doc = blocksToTiptapDoc(tab.blocks);
        const node = schema.nodeFromJSON(doc);
        expect(() => node.check(), `${key}#${tab.tabId}`).not.toThrow();
        expect(node.toJSON()).toEqual(doc);
        checked.push(`${key}#${tab.tabId}`);
      }
    }
    expect(checked).toEqual([
      'landing#index',
      'components/actions/button#index',
      'foundation/color/palette#index',
      'foundation/color/tokens#index',
      'foundation/color/tokens#usage',
    ]);
  });
});

/** Fonte em memória sobre `StaticSiteData` — a forma que o `staticDataSource` terá. */
function memorySource(site: StaticSiteData): DocsDataSource {
  return {
    getNavTree: async () => site.nav,
    getSettings: async () => site.settings,
    getLanding: async () => site.landing,
    getPageBySlug: async (ref) => site.pages[pageKey(ref)] ?? null,
    getPageById: async () => null,
    resolvePath: async () => null,
    search: async () => [],
    getComponentPreview: async () => null,
  };
}

describe('doc pública sobre os dados gerados', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function Site() {
    return useRoutes([createDocsRoute('')]);
  }

  async function render(at: string) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <DocsDataSourceProvider dataSource={memorySource(data)}>
            <MemoryRouter initialEntries={[at]}>
              <Site />
            </MemoryRouter>
          </DocsDataSourceProvider>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  it('landing com o link reescrito para a URL da página', async () => {
    await render('/');
    expect(container.querySelector('[data-testid=landing-published] a[href]')?.getAttribute('href')).toBe(
      '/foundation/color/palette',
    );
    expect([...container.querySelectorAll('.sb-public-menunav-header a')].map((a) => a.textContent)).toEqual([
      'Components',
      'Foundation',
    ]);
  });

  it('página com tabs: título, tab Overview e a tab "Uso" com URL pelo slug', async () => {
    await render('/foundation/color/tokens');
    expect(container.querySelector('.sb-public-title')?.textContent).toBe('Tokens');
    expect([...container.querySelectorAll('[role=tab]')].map((t) => t.textContent)).toEqual(['Overview', 'Uso']);
    expect(container.querySelector('.sb-callout')).not.toBeNull();
    expect(container.querySelector('.sb-callout a')?.getAttribute('href')).toBe('/foundation/color/tokens/usage');
  });

  it('a tab abre pela URL', async () => {
    await render('/foundation/color/tokens/usage');
    expect(container.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Uso');
    expect(container.querySelector('.sb-code-block')).not.toBeNull();
  });
});
