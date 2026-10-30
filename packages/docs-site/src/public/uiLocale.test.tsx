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
 * shell (landing padrão, página com tabs e TOC, 404, busca sem resultado,
 * página Tokens) e garante que nenhum texto do dicionário em inglês sobra,
 * nem em texto visível nem em `aria-label`/`title`/`placeholder`.
 */

const tree: PublicNavTree = [
  {
    id: 'm1',
    titulo: 'Fundamentos',
    slug: 'fundamentos',
    ordem: 0,
    sections: [{ id: 's1', titulo: 'Cor', slug: 'cor', pages: [{ id: 'p1', titulo: 'Paleta', slug: 'paleta' }] }],
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
      ] as Block[],
    },
    { tabId: 'uso', titulo: 'Uso', isPrimary: false, blocks: [] },
  ],
};

const TOKENS: TokenSet = {
  modes: ['claro', 'escuro'],
  tokens: [
    {
      path: 'acme.primaria',
      type: 'color',
      byMode: { claro: { value: '#4f46e5', resolvedValue: '#4f46e5' }, escuro: { value: '#000', resolvedValue: '#000' } },
    } satisfies Token,
  ],
};

const dataSource: DocsDataSource = {
  getNavTree: async () => tree,
  getSettings: async () => ({ nomeDesignSystem: 'Acme', logoUrl: null, logoDarkUrl: null }),
  getLanding: async () => null,
  getPageBySlug: async ({ pageSlug }) =>
    pageSlug === 'paleta' ? { pageId: 'p1', titulo: 'Paleta', subtitulo: null, snapshot } : null,
  getPageById: async () => null,
  resolvePath: async () => null,
  search: async () => [],
  getComponentPreview: async () => null,
  getTokens: async () => TOKENS,
};

/**
 * Trechos fixos de cada mensagem em inglês (o texto entre as variáveis) que
 * mudam no pt-BR — "Tokens", igual nos dois, não diz nada sobre o idioma.
 */
function fragments(value: MessageValue): string[] {
  const texts = typeof value === 'string' ? [value] : Object.values(value);
  return texts.flatMap((t) => (t ?? '').split(/\{\w+\}/)).map((f) => f.trim()).filter((f) => f.length >= 4);
}
const PT_FRAGMENTS = new Set(Object.values(ptBR).flatMap(fragments));
const EN_ONLY = [...new Set(Object.values(en).flatMap(fragments))].filter((f) => !PT_FRAGMENTS.has(f));

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

async function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <DocsDataSourceProvider dataSource={dataSource}>
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
  await settle();
}

const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt'];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** O que o leitor vê ou ouve: o texto e os atributos de acessibilidade. */
function readable(): string {
  const attrs = [...container.querySelectorAll('*')].flatMap((el) =>
    ATTRIBUTES.map((a) => el.getAttribute(a)).filter((v): v is string => !!v),
  );
  return [container.textContent ?? '', ...attrs].join('\n');
}

function expectNoEnglish() {
  const content = readable();
  // Borda de palavra: "result" não pode acusar "resultado".
  const leaked = EN_ONLY.filter((fragment) => new RegExp(`(^|\\W)${escape(fragment)}(\\W|$)`).test(content));
  expect(leaked).toEqual([]);
}

describe('doc pública em pt-BR (SYS-167)', () => {
  it('o dicionário tem trechos em inglês para procurar', () => {
    expect(EN_ONLY).toContain('On this page');
    expect(EN_ONLY).toContain('Open navigation');
  });

  it('landing padrão, header e sidebar', async () => {
    await renderAt('/docs');
    expect(container.querySelector('[data-testid=landing-default]')?.textContent).toContain('Comece por Paleta.');
    expect(container.querySelector('[data-testid=nav-toggle]')?.getAttribute('aria-label')).toBe('Abrir navegação');
    expect(container.querySelector('[data-testid=search-open]')?.getAttribute('aria-label')).toBe('Buscar em Acme');
    expectNoEnglish();
  });

  it('página com tabs, sumário e âncoras', async () => {
    await renderAt('/docs/fundamentos/cor/paleta');
    // O editor read-only monta o conteúdo e o `useHeadingIds` varre depois.
    await settle(20);
    await settle();
    const tabs = [...container.querySelectorAll('[role=tab]')].map((t) => t.textContent);
    expect(tabs).toEqual(['Visão geral', 'Uso']);
    expect(container.querySelector('.sb-toc-title')?.textContent).toBe('Nesta página');
    expect(container.querySelector('.sb-heading-anchor')?.getAttribute('aria-label')).toBe('Copiar link para esta seção');
    expectNoEnglish();
  });

  it('404', async () => {
    await renderAt('/docs/nada/aqui/existe');
    expect(container.querySelector('[data-testid=public-not-found]')?.textContent).toContain('Página não encontrada');
    expectNoEnglish();
  });

  it('busca sem resultado', async () => {
    await renderAt('/docs');
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid=search-open]')!.click();
    });
    await settle();
    const input = container.querySelector<HTMLInputElement>('[data-testid=public-search-input]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'zzz');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle(250);
    await settle();
    expect(container.querySelector('[data-testid=search-no-results]')?.textContent).toBe('Nenhum resultado encontrado.');
    expect(input.placeholder).toBe('Buscar em Acme');
    expectNoEnglish();
  });

  it('página Tokens', async () => {
    await renderAt('/docs/tokens');
    expect(container.querySelector('.sb-page-subtitle')?.textContent).toBe('1 design token em 2 modos (claro, escuro).');
    expectNoEnglish();
  });
});
