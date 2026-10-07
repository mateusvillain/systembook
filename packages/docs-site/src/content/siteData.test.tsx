// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getSchema } from '@tiptap/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlockType, PageSnapshot, StaticSiteData, Token, TokenSet } from '@systembook/schema';
import { buildContentTree, buildSiteData, siteDataFiles, STATIC_DATA_DIR } from '@systembook/content';
import { createStaticDataSource } from '../static/staticDataSource.js';
import { fsFetch, writeSiteDataDir } from '../../test/fsFetch.js';
import { blocksToTiptapDoc } from './blocksToTiptapDoc.js';
import { contentExtensions } from './extensions.js';
import { DocsDataSourceProvider } from './dataSource.js';
import { createDocsRoute } from '../public/createDocsRoute.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Os dados do site estático (SYS-96) são o que a doc pública lê no modo
 * estático. Aqui eles são gerados de um projeto fixture e conferidos do lado do
 * renderer: cada snapshot é válido no schema real, e a doc pública montada
 * sobre o `staticDataSource` (SYS-98), lendo os JSONs escritos num diretório,
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
    [
      '<ComponentEmbed component="Button" variant="secondary" />',
      '<DosDonts variant="do" title="Verbo" coverComponent="Button" coverVariant="primary">\n  Use <u>verbos</u>.\n</DosDonts>',
      '<DosDonts variant="dont" coverImage="./dont.png" coverAlt="Errado">\n  Sem verbo.\n</DosDonts>',
      '<TokenTable group="color.brand" />',
      '<TokenTable group="color.nope" />',
    ].join('\n\n'),
  ),
};

const token = (path: string, type: Token['type'], value: string): Token => ({
  path,
  type,
  byMode: { light: { value, resolvedValue: value }, dark: { value, resolvedValue: value } },
});
const TOKENS: TokenSet = {
  modes: ['light', 'dark'],
  tokens: [
    token('color.brand.primary', 'color', '#4f46e5'),
    token('color.brand.duration', 'duration', '200ms'),
    token('color.brand.space', 'dimension', '8px'),
    token('color.neutral', 'color', '#64748b'),
  ],
};

const tree = buildContentTree(Object.entries(FILES).map(([path, source]) => ({ path, source })));
const { data, diagnostics } = buildSiteData(tree, {
  settings: { nomeDesignSystem: 'Acme DS', logoUrl: null, logoDarkUrl: null },
  base: '/',
  tokens: TOKENS,
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

  it('o fixture cobre todos os tipos de bloco', () => {
    const all: Record<BlockType, true> = {
      heading: true,
      paragraph: true,
      list: true,
      code: true,
      image: true,
      table: true,
      callout: true,
      'component-embed': true,
      'dos-donts': true,
      'token-table': true,
    };
    const types = new Set(snapshots(data).flatMap(([, s]) => s.tabs.flatMap((t) => t.blocks.map((b) => b.type))));
    expect([...types].sort()).toEqual(Object.keys(all).sort());
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

/** Os JSONs de `siteDataFiles` num diretório temporário, servidos em `/_systembook/data/`. */
const { dir: dataDir, cleanup } = writeSiteDataDir(siteDataFiles(data));
afterAll(cleanup);
const DATA_URL = `/${STATIC_DATA_DIR}`;

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

  /** Monta a doc em `at` e espera `ready` aparecer (as leituras vêm do disco). */
  async function render(at: string, ready: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <DocsDataSourceProvider
            dataSource={createStaticDataSource({ dataUrl: DATA_URL, fetch: fsFetch(dataDir, DATA_URL) })}
          >
            <MemoryRouter initialEntries={[at]}>
              <Site />
            </MemoryRouter>
          </DocsDataSourceProvider>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await vi.waitFor(() => {
        if (!container.querySelector(ready)) throw new Error(`esperando ${ready} em ${at}`);
      });
    });
  }

  it('landing com o link reescrito para a URL da página', async () => {
    await render('/', '[data-testid=landing-published]');
    expect(container.querySelector('[data-testid=landing-published] a[href]')?.getAttribute('href')).toBe(
      '/foundation/color/palette',
    );
    expect([...container.querySelectorAll('.sb-public-menunav-header a')].map((a) => a.textContent)).toEqual([
      'Components',
      'Foundation',
    ]);
  });

  it('página com tabs: título, tab Overview e a tab "Uso" com URL pelo slug', async () => {
    await render('/foundation/color/tokens', '.sb-callout');
    expect(container.querySelector('.sb-public-title')?.textContent).toBe('Tokens');
    expect([...container.querySelectorAll('[role=tab]')].map((t) => t.textContent)).toEqual(['Overview', 'Uso']);
    expect(container.querySelector('.sb-callout')).not.toBeNull();
    expect(container.querySelector('.sb-callout a')?.getAttribute('href')).toBe('/foundation/color/tokens/usage');
  });

  it('imagem com o src no site', async () => {
    await render('/foundation/color/palette', '.sb-public-content img');
    expect(container.querySelector('.sb-public-content img')?.getAttribute('src')).toBe('/foundation/color/p.png');
  });

  it('cover de imagem do dos-donts com o src no site', async () => {
    await render('/components/actions/button', '.sb-public-content img');
    expect([...container.querySelectorAll('.sb-public-content img')].map((i) => i.getAttribute('src'))).toEqual([
      '/components/actions/dont.png',
    ]);
  });

  it('bloco token-table: o grupo com o renderer de cada tipo; grupo sem tokens vira aviso', async () => {
    await render('/components/actions/button', '.sb-token-block[data-state=ready]');
    const [ready, empty] = [...container.querySelectorAll<HTMLElement>('.sb-token-block')];
    expect(ready!.dataset.group).toBe('color.brand');
    // cor (swatch), dimensão (barra) e o fallback, cada um na sua tabela, na ordem do primeiro token
    expect([...ready!.querySelectorAll('table')].map((t) => t.getAttribute('aria-label'))).toEqual([
      'color.brand (color)',
      'color.brand (duration)',
      'color.brand (dimension)',
    ]);
    expect(ready!.querySelector('.sb-token-color')).not.toBeNull();
    expect(ready!.textContent).not.toContain('color.neutral');
    expect(empty!.dataset.state).toBe('empty');
    expect(empty!.textContent).toBe('No tokens in group color.nope.');
  });

  it('a tab abre pela URL', async () => {
    await render('/foundation/color/tokens/usage', '.sb-code-block');
    expect(container.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('Uso');
    expect(container.querySelector('.sb-code-block')).not.toBeNull();
  });
});
