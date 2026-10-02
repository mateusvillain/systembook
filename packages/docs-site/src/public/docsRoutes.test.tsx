// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocsDataSource, PublicNavTree } from '@systembook/schema';
import { DocsDataSourceProvider } from '../content/dataSource.js';
import { DocsRoutesProvider, useDocsPaths, type DocsPaths } from './docsRoutes.js';
import { LegacyDocsRedirect } from './LegacyDocsRedirect.js';
import { PublicHome } from './PublicHome.js';
import { PublicLayout } from './PublicLayout.js';

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

const dataSource: DocsDataSource = {
  getNavTree: async () => tree,
  getSettings: async () => ({ nomeDesignSystem: 'Acme DS', logoUrl: null, logoDarkUrl: null }),
  getLanding: async () => null,
  getPageBySlug: async () => null,
  getPageById: async () => null,
  // Forma legada `section/page` → canônica com o menu.
  resolvePath: async ([section, page]) =>
    section === 'color' && page === 'palette'
      ? { menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette', tabId: null }
      : null,
  search: async () => [],
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

/** Site como o modo estático monta: doc na raiz, publicada sob `/meu-repo`. */
function StaticSite({ at }: { at: string }) {
  return (
    <DocsRoutesProvider prefix="">
      <MemoryRouter basename="/meu-repo" initialEntries={[at]}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={<PublicLayout />}>
            <Route index element={<PublicHome />} />
            <Route path=":menuSlug/:sectionSlug/:pageSlug" element={<p data-testid="page" />} />
            <Route path=":sectionSlug/:pageSlug" element={<LegacyDocsRedirect />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </DocsRoutesProvider>
  );
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

  it('sem provider usa o prefixo /docs do modo CMS', () => {
    const paths = capture();
    expect(paths.home).toBe('/docs');
    expect(paths.page(ref)).toBe('/docs/m/s/p');
    expect(paths.page(ref, 't1')).toBe('/docs/m/s/p/t1');
    expect(paths.legacyPage('s', 'p')).toBe('/docs/s/p');
    expect(paths.segments('/docs/m/s/p')).toEqual(['m', 's', 'p']);
    expect(paths.segments('/docs')).toEqual([]);
  });

  it('prefixo vazio põe a doc na raiz', () => {
    const paths = capture('');
    expect(paths.home).toBe('/');
    expect(paths.page(ref)).toBe('/m/s/p');
    expect(paths.segments('/m/s/p')).toEqual(['m', 's', 'p']);
    expect(paths.segments('/')).toEqual([]);
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

    expect(currentPath).toBe('/foundation/color/palette');
    expect(container.querySelector('[data-testid=page]')).not.toBeNull();
  });
});
