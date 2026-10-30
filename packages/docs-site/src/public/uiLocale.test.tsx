// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, DocsDataSource, PageSnapshot, PublicNavTree, Token, TokenSet } from '@systembook/schema';
import { DocsDataSourceProvider } from '../content/dataSource.js';
import { UiLocaleProvider } from '../i18n/UiLocale.js';
import { en } from '../i18n/messages/en.js';
import { ptBR } from '../i18n/messages/pt-BR.js';
import type { MessageValue } from '../i18n/format.js';
import { createDocsRoute } from './createDocsRoute.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Interface fixa da doc pública em pt-BR (SYS-167): percorre os estados do
 * shell e garante que nenhum texto em inglês sobra, nem visível nem em
 * `aria-label`/`title`/`placeholder`/`alt`. Duas redes: os trechos do
 * dicionário `en` (pega a volta de um literal antigo) e palavras comuns do
 * inglês de interface (pega um literal novo que nunca entrou no dicionário).
 * O conteúdo das fixtures é todo em português para não acusar nada.
 */

const tree: PublicNavTree = [
  {
    id: 'm1',
    titulo: 'Fundamentos',
    slug: 'fundamentos',
    ordem: 0,
    sections: [
      {
        id: 's1',
        titulo: 'Cor',
        slug: 'cor',
        pages: [
          { id: 'p1', titulo: 'Paleta', slug: 'paleta' },
          { id: 'p3', titulo: 'Rascunho', slug: 'rascunho' },
        ],
      },
    ],
  },
  {
    id: 'm2',
    titulo: 'Componentes',
    slug: 'componentes',
    ordem: 1,
    sections: [{ id: 's2', titulo: 'Ações', slug: 'acoes', pages: [{ id: 'p2', titulo: 'Botão', slug: 'botao' }] }],
  },
];

const text = (value: string) => [{ type: 'text', text: value }];

const snapshot: PageSnapshot = {
  tabs: [
    {
      tabId: 'corpo',
      // Sem título customizado: a visão do corpo usa o rótulo padrão do dicionário.
      titulo: '',
      isPrimary: true,
      blocks: [
        { id: 'h', tabId: 'corpo', type: 'heading', ordem: 0, content: { level: 2, body: text('Introdução') } },
        { id: 'p', tabId: 'corpo', type: 'paragraph', ordem: 1, content: { body: text('Corpo') } },
        { id: 'c', tabId: 'corpo', type: 'code', ordem: 2, content: { language: null, code: 'cor = 1' } },
      ] as Block[],
    },
    { tabId: 'uso', titulo: 'Uso', isPrimary: false, blocks: [] },
  ],
};

const color = (path: string, value: string): Token => ({
  path,
  type: 'color',
  byMode: { claro: { value, resolvedValue: value }, escuro: { value: '#000', resolvedValue: '#000' } },
});

// `primaria` mora na raiz (sem grupo) e `acme.fundo` no grupo `acme`.
const TOKENS: TokenSet = { modes: ['claro', 'escuro'], tokens: [color('primaria', '#4f46e5'), color('acme.fundo', '#fff')] };

const dataSource: DocsDataSource = {
  getNavTree: async () => tree,
  getSettings: async () => ({ nomeDesignSystem: 'Acme', logoUrl: null, logoDarkUrl: null }),
  getLanding: async () => null,
  getPageBySlug: async ({ pageSlug }) => {
    if (pageSlug === 'paleta') return { pageId: 'p1', titulo: 'Paleta', subtitulo: null, snapshot };
    if (pageSlug === 'rascunho') return { pageId: 'p3', titulo: 'Rascunho', subtitulo: null, snapshot: null };
    return null;
  },
  getPageById: async () => null,
  resolvePath: async () => null,
  search: async (q) =>
    q === 'bot'
      ? [
          {
            pageId: 'p2',
            pageTitulo: 'Botão',
            pageSlug: 'botao',
            sectionTitulo: 'Ações',
            sectionSlug: 'acoes',
            menuSlug: 'componentes',
            snippet: 'Botão primário',
          },
        ]
      : [],
  getComponentPreview: async () => null,
  getTokens: async () => TOKENS,
};

/**
 * Trechos fixos de cada mensagem em inglês (o texto entre as variáveis) que
 * mudam no pt-BR — "Tokens", igual nos dois, não diz nada sobre o idioma.
 */
function fragments(value: MessageValue): string[] {
  const texts = typeof value === 'string' ? [value] : Object.values(value);
  return texts
    .flatMap((message) => (message ?? '').split(/\{\w+\}/))
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= 4);
}
const PT_FRAGMENTS = new Set(Object.values(ptBR).flatMap(fragments));
const EN_ONLY = [...new Set(Object.values(en).flatMap(fragments))].filter((f) => !PT_FRAGMENTS.has(f));

/**
 * Palavras que só aparecem numa interface em inglês — nenhuma é palavra em
 * português (por isso ficam de fora "link", "menus", "tokens").
 */
const ENGLISH_WORDS = [
  'the', 'this', 'to', 'of', 'and', 'or', 'not', 'yet', 'has', 'been', 'is', 'are', 'with', 'for', 'in',
  'page', 'pages', 'copy', 'copied', 'search', 'open', 'close', 'loading', 'failed', 'load', 'result',
  'results', 'found', 'navigate', 'navigation', 'select', 'switch', 'theme', 'light', 'dark',
  'documentation', 'contents', 'views', 'overview', 'published', 'example', 'block', 'section', 'ungrouped',
];
const ENGLISH_WORD = new RegExp(`(^|[^\\p{L}])(${ENGLISH_WORDS.join('|')})(?=[^\\p{L}]|$)`, 'iu');

const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt'];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function DocsRoutes() {
  return useRoutes([createDocsRoute('/docs')]);
}

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** Espera `find()` achar algo (queries, debounce da busca e editor são assíncronos). */
async function until<T>(find: () => T | null | undefined, timeout = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() - start > timeout) throw new Error('until: tempo esgotado');
    await settle(10);
  }
}

const $ = (selector: string) => container.querySelector<HTMLElement>(selector);

async function renderAt(path: string, source: DocsDataSource = dataSource) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <DocsDataSourceProvider dataSource={source}>
          <UiLocaleProvider locale="pt-BR">
            <MemoryRouter initialEntries={[path]}>
              <DocsRoutes />
            </MemoryRouter>
          </UiLocaleProvider>
        </DocsDataSourceProvider>
      </QueryClientProvider>,
    );
  });
  await settle();
}

/**
 * O que o leitor vê ou ouve: cada nó de texto e os atributos de acessibilidade,
 * fora de `skip` (trechos que ainda não são desta issue).
 */
function readable(skip?: string): string[] {
  const elements = [...container.querySelectorAll('*')].filter((el) => !skip || !el.closest(skip));
  const attrs = elements.flatMap((el) =>
    ATTRIBUTES.map((a) => el.getAttribute(a)).filter((v): v is string => !!v),
  );
  const texts = elements
    .flatMap((el) => [...el.childNodes])
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '');
  return [...texts, ...attrs].map((s) => s.trim()).filter(Boolean);
}

function expectNoEnglish(skip?: string) {
  const content = readable(skip);
  const joined = content.join('\n');
  // Borda de palavra: "result" não pode acusar "resultado".
  const fromDictionary = EN_ONLY.filter((fragment) => new RegExp(`(^|\\W)${escape(fragment)}(\\W|$)`).test(joined));
  const englishWords = content.filter((s) => ENGLISH_WORD.test(s));
  expect({ fromDictionary, englishWords }).toEqual({ fromDictionary: [], englishWords: [] });
}

async function typeInto(input: HTMLInputElement, query: string) {
  await act(async () => {
    // Input controlado: o valor passa pelo setter nativo para o React enxergar.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('doc pública em pt-BR (SYS-167)', () => {
  it('as redes de detecção funcionam', () => {
    expect(EN_ONLY).toContain('On this page');
    expect(ENGLISH_WORD.test('Open docs')).toBe(true);
    expect(ENGLISH_WORD.test('Copy link')).toBe(true);
    expect(ENGLISH_WORD.test('Menus da documentação')).toBe(false);
    expect(ENGLISH_WORD.test('Nenhum resultado encontrado.')).toBe(false);
    expect(ENGLISH_WORD.test('Esta página ainda não foi publicada.')).toBe(false);
  });

  it('landing padrão, header e sidebar', async () => {
    await renderAt('/docs');
    const landing = await until(() => $('[data-testid=landing-default]'));
    expect(landing.textContent).toContain('Comece por Paleta.');
    expect($('[data-testid=nav-toggle]')?.getAttribute('aria-label')).toBe('Abrir navegação');
    expect($('[data-testid=search-open]')?.getAttribute('aria-label')).toBe('Buscar em Acme');
    expectNoEnglish();
  });

  it('sem páginas publicadas', async () => {
    await renderAt('/docs', { ...dataSource, getNavTree: async () => [], getTokens: async () => null });
    const landing = await until(() => $('[data-testid=landing-default]'));
    expect(landing.textContent).toContain('Nenhuma página foi publicada ainda.');
    expect($('.sb-public-sidebar')?.textContent).toContain('Nenhuma página publicada ainda.');
    expectNoEnglish();
  });

  it('página com tabs, sumário e âncoras de seção e de código', async () => {
    await renderAt('/docs/fundamentos/cor/paleta');
    const toc = await until(() => $('.sb-toc-title'));
    expect(toc.textContent).toBe('Nesta página');
    expect([...container.querySelectorAll('[role=tab]')].map((t) => t.textContent)).toEqual(['Visão geral', 'Uso']);
    expect($('.sb-heading-anchor')?.getAttribute('aria-label')).toBe('Copiar link para esta seção');
    const codeAnchor = await until(() => $('.sb-block-anchor'));
    expect(codeAnchor.getAttribute('aria-label')).toBe('Copiar link para este bloco de código');
    // O bloco de código (botão "Copy", rótulo da linguagem) é da SYS-168; a
    // âncora dele já foi conferida acima.
    expectNoEnglish('.sb-code-block');
  });

  it('página ainda não publicada', async () => {
    await renderAt('/docs/fundamentos/cor/rascunho');
    const notPublished = await until(() => $('[data-testid=not-published]'));
    expect(notPublished.textContent).toBe('Esta página ainda não foi publicada.');
    expectNoEnglish();
  });

  it('404', async () => {
    await renderAt('/docs/nada/aqui/existe');
    const notFound = await until(() => $('[data-testid=public-not-found]'));
    expect(notFound.textContent).toContain('Página não encontrada');
    expectNoEnglish();
  });

  it('busca com e sem resultado', async () => {
    await renderAt('/docs');
    await act(async () => {
      $('[data-testid=search-open]')!.click();
    });
    const input = await until(() => container.querySelector<HTMLInputElement>('[data-testid=public-search-input]'));
    expect(input.placeholder).toBe('Buscar em Acme');

    await typeInto(input, 'bot');
    const results = await until(() => $('[data-testid=search-results]'));
    expect(results.getAttribute('aria-label')).toBe('Resultados');
    expect($('.sb-palette-sr')?.textContent).toBe('1 resultado');
    expectNoEnglish();

    await typeInto(input, 'zzz');
    const empty = await until(() => $('[data-testid=search-no-results]'));
    expect(empty.textContent).toBe('Nenhum resultado encontrado.');
    expectNoEnglish();
  });

  it('página Tokens', async () => {
    await renderAt('/docs/tokens');
    const subtitle = await until(() => $('.sb-page-subtitle'));
    expect(subtitle.textContent).toBe('2 design tokens em 2 modos (claro, escuro).');
    expect([...container.querySelectorAll('.sb-tokens-page h2')].map((h) => h.textContent)).toContain('Sem grupo');
    // Os renderers de token (`src/content/tokens`) são da SYS-168: aqui só o shell e o cabeçalho.
    expectNoEnglish('.sb-tokens-page section > :not(h2)');
  });
});
