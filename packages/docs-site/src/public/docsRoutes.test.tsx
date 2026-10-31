// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, DocsDataSource, PageSnapshot, PublicNavTree, Token, TokenSet } from '@systembook/schema';
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
  getSettings: async () => ({
    nomeDesignSystem: 'Acme DS',
    logoUrl: null,
    logoDarkUrl: null,
    locales: [{ code: 'en', label: 'English' }],
    defaultLocale: 'en',
  }),
  getLanding: async () => null,
  getPageBySlug: async (ref) =>
    ref.pageSlug === 'palette'
      ? { pageId: 'p1', titulo: 'Palette', subtitulo: null, snapshot, locale: 'en', alternates: { en: ref } }
      : null,
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
  getTokens: async () => null,
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
  // Deixa as queries resolverem e o React reagir: as settings (que montam as
  // rotas por idioma) e, depois, as leituras da rota.
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
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
  // jsdom não implementa `<dialog>` modal: o stub liga o atributo `open` e
  // dispara `close`, que é o contrato de que a palette depende.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
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

  const openPalette = async () => {
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid=search-open]')!.click();
    });
    await settle();
    return container.querySelector<HTMLDialogElement>('dialog.sb-palette')!;
  };

  const type = async (text: string) => {
    const input = container.querySelector<HTMLInputElement>('[data-testid=public-search-input]')!;
    await act(async () => {
      // Input controlado: o valor precisa passar pelo setter nativo para o
      // React enxergar a mudança.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle(250); // debounce da busca
    await settle();
    return input;
  };

  const key = (input: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
    act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    });

  it('a palette abre pelo gatilho só com o campo, sem lista até digitar', async () => {
    await render(<StaticSite at="/meu-repo/" />);
    expect(container.querySelector('dialog.sb-palette')!.hasAttribute('open')).toBe(false);

    const dialog = await openPalette();
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('[data-testid=public-search-input]')).not.toBeNull();
    expect(dialog.querySelector('[data-testid=search-result]')).toBeNull();
    expect(dialog.querySelector('.sb-palette-body')).toBeNull();
    // Sem lista no DOM, o combobox não aponta para um listbox inexistente.
    const input = dialog.querySelector('[data-testid=public-search-input]')!;
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-controls')).toBe(false);
  });

  it('a busca mostra título, descrição com destaque e o href com a base do router', async () => {
    await render(<StaticSite at="/meu-repo/" />);
    await openPalette();
    await type('bot');
    const item = container.querySelector('[data-testid=search-result]')!;
    expect(item.querySelector('.sb-palette-item-title')!.textContent).toBe('Button');
    expect(item.querySelector('.sb-palette-item-desc')!.textContent).toBe('Botão');
    expect(item.getAttribute('href')).toBe('/meu-repo/components/actions/button');

    const input = container.querySelector('[data-testid=public-search-input]')!;
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-controls')!)).not.toBeNull();
  });

  it('⌘K abre a palette e Esc/fechar a fecham', async () => {
    await render(<StaticSite at="/meu-repo/" />);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    });
    const dialog = container.querySelector<HTMLDialogElement>('dialog.sb-palette')!;
    expect(dialog.hasAttribute('open')).toBe(true);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid=search-close]')!.click();
    });
    expect(dialog.hasAttribute('open')).toBe(false);
    // Fechou: o corpo desmonta, então a próxima abertura começa limpa.
    expect(container.querySelector('[data-testid=public-search-input]')).toBeNull();

    // O navegador fecha o dialog sozinho no Esc, e o `close` volta ao estado do pai.
    await openPalette();
    await act(async () => dialog.close());
    expect(container.querySelector('[data-testid=public-search-input]')).toBeNull();
  });

  it('digitar busca, ↑/↓ navegam com wrap e Enter navega dentro do prefixo', async () => {
    await render(<StaticSite at="/meu-repo/" />);
    await openPalette();
    const input = await type('bot');

    const results = () => [...container.querySelectorAll('[data-testid=search-result]')];
    expect(results()).toHaveLength(1);
    expect(container.querySelector('.sb-palette-group-label')!.textContent).toBe('Actions');
    expect(input.getAttribute('aria-activedescendant')).toBe(results()[0]!.id);

    await key(input, 'ArrowDown'); // 1 item: dá a volta no próprio item
    expect(results()[0]!.getAttribute('aria-selected')).toBe('true');
    await key(input, 'ArrowUp');
    expect(results()[0]!.getAttribute('aria-selected')).toBe('true');

    await key(input, 'Enter');
    expect(currentPath).toBe('/components/actions/button');
    expect(container.querySelector('dialog.sb-palette')!.hasAttribute('open')).toBe(false);
  });

  it('⌘K alterna: com a palette aberta, fecha', async () => {
    await render(<StaticSite at="/meu-repo/" />);
    const toggle = () =>
      act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
      });
    const dialog = container.querySelector<HTMLDialogElement>('dialog.sb-palette')!;
    await toggle();
    expect(dialog.hasAttribute('open')).toBe(true);
    await toggle();
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('a região de anúncio fica montada fora da lista e usa o singular', async () => {
    await render(<StaticSite at="/meu-repo/" />);
    await openPalette();
    const live = () => container.querySelector('dialog.sb-palette [role=status]')!;
    // Montada antes de qualquer texto, para o leitor de tela anunciar as mudanças.
    expect(live().textContent).toBe('');
    await type('bot');
    expect(live().textContent).toBe('1 result');
  });

  it('Enter com a lista da busca anterior (debounce pendente) não navega', async () => {
    await render(<StaticSite at="/meu-repo/" />);
    await openPalette();
    const input = await type('bot');
    const before = currentPath;
    // Muda o texto e aperta Enter antes do debounce: a lista ainda é a de "bot".
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'bota');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await key(input, 'Enter');
    expect(currentPath).toBe(before);
    expect(container.querySelector('dialog.sb-palette')!.hasAttribute('open')).toBe(true);
  });

  it('⌘/Ctrl+Enter abre o resultado em outra aba e deixa a palette aberta', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await render(<StaticSite at="/meu-repo/" />);
    await openPalette();
    const input = await type('bot');
    await key(input, 'Enter', { metaKey: true });

    expect(open).toHaveBeenCalledWith('/meu-repo/components/actions/button', '_blank', 'noopener');
    expect(container.querySelector('dialog.sb-palette')!.hasAttribute('open')).toBe(true);
    open.mockRestore();
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

describe('doc pública em vários idiomas (SYS-176)', () => {
  const locales = [
    { code: 'en', label: 'English' },
    { code: 'pt-BR', label: 'Português' },
  ];
  const ptTree: PublicNavTree = [
    {
      id: 'm1',
      titulo: 'Fundamentos',
      slug: 'fundamentos',
      ordem: 0,
      sections: [{ id: 's1', titulo: 'Cor', slug: 'cor', pages: [{ id: 'p1', titulo: 'Paleta', slug: 'paleta' }] }],
    },
  ];

  function sources() {
    const en: DocsDataSource = {
      ...dataSource,
      getSettings: async () => ({ ...(await dataSource.getSettings()), locales, defaultLocale: 'en' }),
      // Traduzida: o alternate leva aos slugs em pt-BR.
      getPageBySlug: vi.fn(async (ref) => {
        const page = await dataSource.getPageBySlug(ref);
        return page && { ...page, alternates: { en: ref, 'pt-BR': { menuSlug: 'fundamentos', sectionSlug: 'cor', pageSlug: 'paleta' } } };
      }),
    };
    const pt: DocsDataSource = {
      ...dataSource,
      getNavTree: async () => ptTree,
      getPageBySlug: vi.fn(async (ref) =>
        ref.pageSlug === 'paleta'
          ? { pageId: 'p1', titulo: 'Paleta', subtitulo: null, snapshot, locale: 'pt-BR', alternates: { 'pt-BR': ref } }
          : null,
      ),
      resolvePath: async ([section, page]) =>
        section === 'cor' && page === 'paleta'
          ? { menuSlug: 'fundamentos', sectionSlug: 'cor', pageSlug: 'paleta', tabId: null }
          : null,
    };
    const factory = vi.fn((locale: string | null) => (locale === 'pt-BR' ? pt : en));
    return { en, pt, factory };
  }

  async function renderLocales(
    at: string,
    factory: (locale: string | null) => DocsDataSource,
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  ) {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DocsDataSourceProvider dataSource={factory}>
            <MemoryRouter key={at} initialEntries={[at]}>
              <LocationProbe />
              <DocsRoutes prefix="/docs" />
            </MemoryRouter>
          </DocsDataSourceProvider>
        </QueryClientProvider>,
      );
    });
    await settle();
    await settle();
  }

  const navToggleLabel = () => container.querySelector('.sb-nav-toggle')!.getAttribute('aria-label');

  it('o padrão fica sem prefixo e lê da fonte padrão', async () => {
    const { en, factory } = sources();
    await renderLocales('/docs/foundation/color/palette', factory);

    expect(container.querySelector('h1')?.textContent).toBe('Palette');
    expect(en.getPageBySlug).toHaveBeenCalledWith({ menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette' });
    expect(hrefs('.sb-public-brand-link')).toEqual(['/docs']);
    expect(navToggleLabel()).toBe('Open navigation');
    // O padrão reaproveita a fonte `null`: a fábrica nunca é chamada com `en`.
    expect(factory.mock.calls.map(([locale]) => locale)).toEqual([null]);
  });

  it('/<seg>/… serve o idioma: fonte, links e interface', async () => {
    const { pt, factory } = sources();
    await renderLocales('/docs/pt-br/fundamentos/cor/paleta', factory);

    expect(container.querySelector('h1')?.textContent).toBe('Paleta');
    expect(pt.getPageBySlug).toHaveBeenCalledWith({ menuSlug: 'fundamentos', sectionSlug: 'cor', pageSlug: 'paleta' });
    expect(hrefs('.sb-public-brand-link')).toEqual(['/docs/pt-br']);
    expect(hrefs('.sb-public-pagelink')).toEqual(['/docs/pt-br/fundamentos/cor/paleta']);
    expect(container.querySelector('.sb-public-pagelink')!.classList.contains('active')).toBe(true);
    expect(navToggleLabel()).toBe('Abrir navegação');
  });

  it('cada idioma tem o próprio cache: trocar de idioma não reaproveita a nav do outro', async () => {
    const { factory } = sources();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await renderLocales('/docs/pt-br', factory, queryClient);
    expect(container.querySelector('.sb-public-section-title')?.textContent).toBe('Cor');

    await renderLocales('/docs', factory, queryClient);
    expect(container.querySelector('.sb-public-section-title')?.textContent).toBe('Color');
  });

  it('prefixo que não é idioma configurado segue o roteamento do padrão', async () => {
    const { en, pt, factory } = sources();
    await renderLocales('/docs/es/color/palette', factory);

    expect(en.getPageBySlug).toHaveBeenCalledWith({ menuSlug: 'es', sectionSlug: 'color', pageSlug: 'palette' });
    expect(pt.getPageBySlug).not.toHaveBeenCalled();
  });

  it('sem settings (falha), a doc segue nas rotas do padrão', async () => {
    const failing: DocsDataSource = {
      ...dataSource,
      getSettings: async () => {
        throw new Error('offline');
      },
    };
    await renderLocales('/docs/foundation/color/palette', () => failing);
    await settle();

    expect(container.querySelector('h1')?.textContent).toBe('Palette');
    expect(hrefs('.sb-public-pagelink')).toContain('/docs/foundation/color/palette');
  });

  describe('seletor de idioma (SYS-184)', () => {
    const items = (variant: 'header' | 'drawer') =>
      [...container.querySelectorAll(`.sb-locale-${variant} .sb-locale-item`)].map((a) => ({
        label: a.textContent,
        href: a.getAttribute('href'),
        lang: a.getAttribute('lang'),
        current: a.getAttribute('aria-current'),
      }));

    it('com um idioma só, não aparece', async () => {
      await renderLocales('/docs/foundation/color/palette', () => dataSource);
      expect(container.querySelector('h1')?.textContent).toBe('Palette');
      expect(container.querySelector('.sb-locale')).toBeNull();
    });

    it('leva à página equivalente, com a tab, e marca o atual — no header e no drawer', async () => {
      const { factory } = sources();
      await renderLocales('/docs/foundation/color/palette/t2', factory);

      const expected = [
        { label: 'English', href: '/docs/foundation/color/palette/t2', lang: 'en', current: 'true' },
        { label: 'Português', href: '/docs/pt-br/fundamentos/cor/paleta/t2', lang: 'pt-BR', current: null },
      ];
      expect(items('header')).toEqual(expected);
      expect(items('drawer')).toEqual(expected);
    });

    it('sem equivalente, leva à home do idioma', async () => {
      const { factory } = sources();
      // A página em pt-BR não tem alternate em inglês.
      await renderLocales('/docs/pt-br/fundamentos/cor/paleta', factory);
      expect(items('header').map((i) => i.href)).toEqual(['/docs', '/docs/pt-br/fundamentos/cor/paleta']);

      await renderLocales('/docs/pt-br', factory);
      expect(items('header').map((i) => i.href)).toEqual(['/docs', '/docs/pt-br']);

      await renderLocales('/docs', factory);
      expect(items('header').map((i) => i.href)).toEqual(['/docs', '/docs/pt-br']);
    });

    it('botão com o idioma atual abre e fecha a lista pelo teclado', async () => {
      const { factory } = sources();
      await renderLocales('/docs/pt-br/fundamentos/cor/paleta', factory);

      const trigger = container.querySelector<HTMLButtonElement>('.sb-locale-trigger')!;
      const popover = container.querySelector<HTMLElement>('.sb-locale-popover')!;
      expect(trigger.getAttribute('aria-label')).toBe('Idioma: Português');
      expect(trigger.getAttribute('aria-controls')).toBe(popover.id);
      expect(popover.getAttribute('aria-label')).toBe('Idioma');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(popover.hidden).toBe(true);

      act(() => trigger.click());
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(popover.hidden).toBe(false);

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    });

    it('escolher um idioma navega e fecha a lista', async () => {
      const { factory } = sources();
      await renderLocales('/docs/foundation/color/palette', factory);

      act(() => container.querySelector<HTMLButtonElement>('.sb-locale-trigger')!.click());
      act(() => container.querySelectorAll<HTMLAnchorElement>('.sb-locale-header .sb-locale-item')[1]!.click());
      await settle();

      expect(currentPath).toBe('/docs/pt-br/fundamentos/cor/paleta');
      expect(container.querySelector('h1')?.textContent).toBe('Paleta');
      expect(container.querySelector('.sb-locale-trigger')!.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('o redirect legado mantém o prefixo do idioma', async () => {
    const { factory } = sources();
    await renderLocales('/docs/pt-br/cor/paleta', factory);
    await settle();

    expect(currentPath).toBe('/docs/pt-br/fundamentos/cor/paleta');
    expect(container.querySelector('h1')?.textContent).toBe('Paleta');
  });
});

describe('página Tokens gerada (SYS-140)', () => {
  afterEach(() => vi.restoreAllMocks());
  const TOKENS: TokenSet = {
    modes: ['light', 'dark'],
    tokens: (
      [
        ['acme.primary', 'color', '#4f46e5'],
        ['acme.space.1', 'dimension', '4px'],
        ['acme.palette.indigo.500', 'color', '#6366f1'],
      ] as const
    ).map(([path, type, value]): Token => ({
      path,
      type,
      byMode: { light: { value, resolvedValue: value }, dark: { value, resolvedValue: value } },
    })),
  };

  it('sem tokens: nem link no header, nem rota', async () => {
    await render(<StaticSite at="/meu-repo/tokens" />);
    await settle();
    expect(container.querySelector('.sb-public-menunav-header')?.textContent).not.toContain('Tokens');
    expect(container.querySelector('[data-testid=public-not-found]')).not.toBeNull();
  });

  it('com tokens e nenhuma página publicada, o link existe no header e no drawer', async () => {
    vi.spyOn(dataSource, 'getTokens').mockResolvedValue(TOKENS);
    vi.spyOn(dataSource, 'getNavTree').mockResolvedValue([]);
    await render(<StaticSite at="/meu-repo/" />);
    await settle();
    expect(hrefs('.sb-public-menunav-header a')).toEqual(['/meu-repo/tokens']);
    expect(hrefs('.sb-public-menunav-drawer a')).toEqual(['/meu-repo/tokens']);
  });

  it('com tokens: link no header e a página com uma seção por grupo', async () => {
    vi.spyOn(dataSource, 'getTokens').mockResolvedValue(TOKENS);
    await render(<CmsSite at="/docs/tokens" />);
    await settle();

    expect(hrefs('.sb-public-menunav-header a')).toEqual([
      '/docs/foundation/color/palette',
      '/docs/components/actions/button',
      '/docs/tokens',
    ]);
    // Só o pill de Tokens ativo: o segmento único não é menu.
    expect(
      [...container.querySelectorAll('.sb-public-menunav-header [data-active]')].map((a) => a.textContent),
    ).toEqual(['Tokens']);
    expect(container.querySelector('.sb-public-title')?.textContent).toBe('Tokens');
    expect([...container.querySelectorAll('.sb-tokens-page h2')].map((h) => h.textContent)).toEqual([
      'acme',
      'acme.space',
      'acme.palette',
    ]);
    expect(container.querySelectorAll('.sb-tokens-page table')).toHaveLength(3);
  });
});
