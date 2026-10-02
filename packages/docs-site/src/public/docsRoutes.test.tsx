// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, DocsDataSource, PageSnapshot, PublicNavTree } from '@systembook/schema';
import { DocsDataSourceProvider } from '../content/dataSource.js';
import { createDocsRoute } from './createDocsRoute.js';
import { DocsRoutesProvider, useDocsPaths, type DocsPaths } from './docsRoutes.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const tree: PublicNavTree = [
  {
    id: 'm1',
    titulo: 'Foundation',
    slug: 'foundation',
    ordem: 0,
    sections: [
      { id: 's1', titulo: 'Color', slug: 'color', pages: [{ id: 'p1', titulo: 'Palette', slug: 'palette' }] },
    ],
  },
  {
    id: 'm2',
    titulo: 'Components',
    slug: 'components',
    ordem: 1,
    sections: [
      { id: 's2', titulo: 'Actions', slug: 'actions', pages: [{ id: 'p2', titulo: 'Button', slug: 'button' }] },
    ],
  },
];

const paragraph = (tabId: string, text: string): Block => ({
  id: `${tabId}-p`,
  tabId,
  type: 'paragraph',
  ordem: 0,
  content: { body: [{ type: 'text', text }] },
});

/** Página com corpo e uma tab de usuário. */
const snapshot: PageSnapshot = {
  tabs: [
    { tabId: 'body', titulo: 'Overview', isPrimary: true, blocks: [paragraph('body', 'Corpo')] },
    { tabId: 't2', titulo: 'Usage', isPrimary: false, blocks: [paragraph('t2', 'Uso')] },
  ],
};

const dataSource: DocsDataSource = {
  getNavTree: async () => tree,
  getSettings: async () => ({ nomeDesignSystem: 'Acme DS', logoUrl: null, logoDarkUrl: null }),
  getLanding: async () => null,
  getPageBySlug: async ({ pageSlug }) =>
    pageSlug === 'palette' ? { pageId: 'p1', titulo: 'Palette', subtitulo: null, snapshot } : null,
  getPageById: async () => null,
  // Forma legada `section/page` → canônica com o menu.
  resolvePath: async ([section, page]) =>
    section === 'color' && page === 'palette'
      ? { menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette', tabId: null }
      : null,
  search: async () => [
    {
      pageId: 'p2',
      pageTitulo: 'Button',
      pageSlug: 'button',
      sectionTitulo: 'Actions',
      sectionSlug: 'actions',
      menuSlug: 'components',
      snippet: 'Botão',
    },
  ],
  getComponentPreview: async () => null,
};

let container: HTMLDivElement;
let root: Root;
let currentPath = '';

function LocationProbe() {
  currentPath = useLocation().pathname;
  return null;
}

async function render(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <DocsDataSourceProvider dataSource={dataSource}>{ui}</DocsDataSourceProvider>
      </QueryClientProvider>,
    );
  });
  // Deixa as queries resolverem e o React reagir.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function DocsRoutes({ prefix }: { prefix: string }) {
  return useRoutes([createDocsRoute(prefix)]);
}

/** Site como o modo estático monta: doc na raiz, publicada sob `/meu-repo`. */
function StaticSite({ at }: { at: string }) {
  return (
    <MemoryRouter basename="/meu-repo" initialEntries={[at]}>
      <LocationProbe />
      <DocsRoutes prefix="" />
    </MemoryRouter>
  );
}

/** Como o modo CMS monta: doc sob `/docs`, sem base. */
function CmsSite({ at }: { at: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <LocationProbe />
      <DocsRoutes prefix="/docs" />
    </MemoryRouter>
  );
}

/** Dá tempo às queries, ao debounce da busca e ao React. */
async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

const hrefs = (selector: string) =>
  [...container.querySelectorAll(selector)].map((a) => a.getAttribute('href'));

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

describe('useDocsPaths', () => {
  function capture(prefix?: string): DocsPaths {
    let paths!: DocsPaths;
    function Probe() {
      paths = useDocsPaths();
      return null;
    }
    act(() =>
      root.render(prefix === undefined ? <Probe /> : <DocsRoutesProvider prefix={prefix}><Probe /></DocsRoutesProvider>),
    );
    return paths;
  }

  const ref = { menuSlug: 'm', sectionSlug: 's', pageSlug: 'p' };

  it('prefixo /docs (modo CMS)', () => {
    const paths = capture('/docs');
    expect(paths.home).toBe('/docs');
    expect(paths.page(ref)).toBe('/docs/m/s/p');
    expect(paths.page(ref, 't1')).toBe('/docs/m/s/p/t1');
    expect(paths.legacyPage('s', 'p')).toBe('/docs/s/p');
    expect(paths.segments('/docs/m/s/p')).toEqual(['m', 's', 'p']);
    expect(paths.segments('/docs')).toEqual([]);
  });

  it('prefixo vazio põe a doc na raiz — também o default sem provider', () => {
    for (const paths of [capture(''), capture()]) {
      expect(paths.home).toBe('/');
      expect(paths.page(ref)).toBe('/m/s/p');
      expect(paths.page(ref, 't1')).toBe('/m/s/p/t1');
      expect(paths.legacyPage('s', 'p')).toBe('/s/p');
      expect(paths.segments('/m/s/p')).toEqual(['m', 's', 'p']);
      expect(paths.segments('/')).toEqual([]);
    }
  });

  it('pathname fora do prefixo volta inteiro', () => {
    expect(capture('/docs').segments('/outra/coisa')).toEqual(['outra', 'coisa']);
  });

  it('normaliza barras no prefixo', () => {
    expect(capture('guia/').page(ref)).toBe('/guia/m/s/p');
    expect(capture('/').home).toBe('/');
  });
});

describe('doc pública fora da raiz (basename) e sem prefixo', () => {
  it('links de marca, menus, sidebar e landing respeitam basename e prefixo', async () => {
    await render(<StaticSite at="/meu-repo/" />);

    expect(hrefs('.sb-public-brand-link')).toEqual(['/meu-repo']);
    expect(hrefs('.sb-public-menunav-header a')).toEqual([
      '/meu-repo/foundation/color/palette',
      '/meu-repo/components/actions/button',
    ]);
    expect(hrefs('.sb-public-pagelink')).toEqual(['/meu-repo/foundation/color/palette']);
    expect(hrefs('[data-testid=landing-default] a')).toEqual(['/meu-repo/foundation/color/palette']);
  });

  it('o menu ativo vem do primeiro segmento abaixo da raiz da doc', async () => {
    await render(<StaticSite at="/meu-repo/components/actions/button" />);

    const active = container.querySelector('.sb-public-menunav-header [data-active]');
    expect(active?.textContent).toBe('Components');
    expect(hrefs('.sb-public-pagelink')).toEqual(['/meu-repo/components/actions/button']);
  });

  it('URL legada sem menu redireciona para a canônica no mesmo prefixo', async () => {
    await render(<StaticSite at="/meu-repo/color/palette" />);
    await settle();

    expect(currentPath).toBe('/foundation/color/palette');
    expect(container.querySelector('.sb-public-title')?.textContent).toBe('Palette');
  });

  it('trocar de tab leva a URL da tab, e voltar ao corpo tira a tab', async () => {
    await render(<StaticSite at="/meu-repo/foundation/color/palette" />);
    const tab = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(
        (t) => t.textContent === label,
      )!;

    await act(async () => tab('Usage').click());
    expect(currentPath).toBe('/foundation/color/palette/t2');

    await act(async () => tab('Overview').click());
    expect(currentPath).toBe('/foundation/color/palette');
  });

  it('escolher um resultado da busca navega dentro do prefixo', async () => {
    await render(<StaticSite at="/meu-repo/" />);
    const input = container.querySelector<HTMLInputElement>('[data-testid=public-search-input]')!;

    await act(async () => {
      input.focus();
      // Input controlado: o valor precisa passar pelo setter nativo para o
      // React enxergar a mudança.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'bot');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle(350); // debounce da busca
    await settle();

    const result = container.querySelector<HTMLElement>('[data-testid=search-result]')!;
    await act(async () => {
      result.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(currentPath).toBe('/components/actions/button');
  });
});

describe('doc pública sob /docs (modo CMS)', () => {
  it('links e redirect legado continuam em /docs', async () => {
    await render(<CmsSite at="/docs/color/palette" />);
    await settle();

    expect(currentPath).toBe('/docs/foundation/color/palette');
    expect(hrefs('.sb-public-brand-link')).toEqual(['/docs']);
    expect(hrefs('.sb-public-menunav-header a')).toEqual([
      '/docs/foundation/color/palette',
      '/docs/components/actions/button',
    ]);
  });
});
