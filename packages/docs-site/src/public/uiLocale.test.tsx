// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block, DocsDataSource, PageSnapshot, PublicNavTree, Token, TokenSet, TokenValue } from '@systembook/schema';
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
          { id: 'p4', titulo: 'Blocos', slug: 'blocos' },
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

/** Blocos de conteúdo (SYS-168): tabela de tokens, exemplos sem preview e do's & don'ts com capa. */
const blocks: PageSnapshot = {
  tabs: [
    {
      tabId: 'blocos',
      titulo: 'Blocos',
      isPrimary: true,
      blocks: [
        { id: 'tt', tabId: 'blocos', type: 'token-table', ordem: 0, content: { group: '' } },
        { id: 'tv', tabId: 'blocos', type: 'token-table', ordem: 1, content: { group: 'nada' } },
        { id: 'e1', tabId: 'blocos', type: 'component-embed', ordem: 2, content: { componentName: '', variantId: null } },
        { id: 'e2', tabId: 'blocos', type: 'component-embed', ordem: 3, content: { componentName: 'Botao', variantId: 'primario' } },
        { id: 'e3', tabId: 'blocos', type: 'component-embed', ordem: 5, content: { componentName: 'Cartao', variantId: 'padrao' } },
        {
          id: 'dd',
          tabId: 'blocos',
          type: 'dos-donts',
          ordem: 4,
          content: {
            variant: 'do',
            titulo: 'Faça',
            descricao: [{ type: 'paragraph', content: text('Use um rótulo curto.') }],
            cover: { kind: 'component-embed', componentName: 'Botao', variantId: 'primario' },
          },
        },
      ] as Block[],
    },
  ],
};

const both = (value: TokenValue) => ({ claro: { value, resolvedValue: value }, escuro: { value, resolvedValue: value } });
const token = (path: string, type: Token['type'], value: TokenValue, extra: Partial<Token> = {}): Token => ({
  path,
  type,
  byMode: both(value),
  ...extra,
});

/**
 * Um token de cada renderer: `primaria` mora na raiz (sem grupo); `acme.fundo`
 * muda com o modo e os outros não ("Igual em todos os modos"); a escala de cor
 * tem duas irmãs numéricas; um token obsoleto.
 */
const TOKENS: TokenSet = {
  modes: ['claro', 'escuro'],
  tokens: [
    token('primaria', 'color', '#4f46e5'),
    {
      path: 'acme.fundo',
      type: 'color',
      byMode: { claro: { value: '#fff', resolvedValue: '#fff' }, escuro: { value: '#000', resolvedValue: '#000' } },
    },
    token('acme.borda', 'color', '#ddd', { deprecated: true }),
    token('acme.azul.100', 'color', '#dbeafe'),
    token('acme.azul.200', 'color', '#bfdbfe'),
    token('acme.espaco.1', 'dimension', '4px'),
    token('acme.fonte.base', 'fontFamily', ['Inter', 'sans-serif']),
    token('acme.texto.corpo', 'typography', {
      fontFamily: ['Inter'],
      fontSize: '16px',
      fontWeight: 400,
      letterSpacing: '0px',
      lineHeight: 1.5,
    }),
    token('acme.duracao.rapida', 'duration', '100ms'),
  ],
};

const dataSource: DocsDataSource = {
  getNavTree: async () => tree,
  getSettings: async () => ({ nomeDesignSystem: 'Acme', logoUrl: null, logoDarkUrl: null }),
  getLanding: async () => null,
  getPageBySlug: async ({ pageSlug }) => {
    if (pageSlug === 'paleta') return { pageId: 'p1', titulo: 'Paleta', subtitulo: null, snapshot };
    if (pageSlug === 'rascunho') return { pageId: 'p3', titulo: 'Rascunho', subtitulo: null, snapshot: null };
    if (pageSlug === 'blocos') return { pageId: 'p4', titulo: 'Blocos', subtitulo: null, snapshot: blocks };
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
  // Só o `Cartao` tem preview publicado (com controles); o resto fica no estado vazio.
  getComponentPreview: async ({ componentName }) =>
    componentName === 'Cartao'
      ? {
          url: 'about:blank',
          config: {
            component: 'Cartao',
            variants: [{ id: 'padrao', props: {} }],
            controls: [{ kind: 'text', propName: 'titulo', label: 'Título' }],
          },
        }
      : null,
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
  'run', 'play', 'nothing', 'none', 'all', 'same', 'value', 'details', 'family', 'size', 'weight', 'spacing',
  'height', 'preview', 'controls', 'component', 'selected', 'variant', 'cover', 'deprecated', 'path', 'group',
  'press', 'could',
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

describe('doc pública em pt-BR (SYS-167, SYS-168)', () => {
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
    expect($('.sb-code-copy')?.textContent).toBe('Copiar');
    expectNoEnglish();
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
    expect(subtitle.textContent).toBe('9 design tokens em 2 modos (claro, escuro).');
    expect([...container.querySelectorAll('.sb-tokens-page h2')].map((h) => h.textContent)).toContain('Sem grupo');
    expect(container.textContent).toContain('Igual em todos os modos');
    expect(container.textContent).toContain('Obsoleto');
    expect(container.querySelector('.sb-type-specimen-props dt')?.textContent).toBe('Família');
    expectNoEnglish();
  });

  it('blocos: tabela de tokens, exemplos sem preview e capa do do\'s & don\'ts', async () => {
    await renderAt('/docs/fundamentos/cor/blocos');
    await until(() => $('.sb-tokens'));
    const embeds = await until(() => {
      const all = [...container.querySelectorAll<HTMLElement>('.sb-component-embed')];
      return all.length === 3 && all[1]!.dataset.previewState === 'empty' ? all : null;
    });
    expect(embeds[0]!.textContent).toContain('Nenhum componente selecionado');
    expect(embeds[1]!.textContent).toBe('Nenhuma prévia publicada para Botao / primario ainda.');
    expect(container.querySelector('[data-group=nada]')?.textContent).toBe('Nenhum token no grupo nada.');
    const cover = await until(() => container.querySelector<HTMLElement>('.sb-dos-donts-cover-embed[data-preview-state=empty]'));
    expect(cover.textContent).toBe('Nenhuma prévia publicada para Botao / primario ainda.');
    expect($('.sb-dos-donts-icon')?.textContent).toBe('Faça');

    // Exemplo ao vivo: título do iframe, painel de controles e modo dos tokens.
    const live = await until(() => $('.sb-component-embed--live'));
    expect(live.querySelector('iframe')?.getAttribute('title')).toBe('Prévia de Cartao (padrao)');
    expect(live.querySelector('[data-testid=controls-toggle]')?.textContent?.trim()).toBe('Controles (1)');
    expect(live.querySelector('[data-testid=preview-mode]')?.getAttribute('aria-label')).toBe('Modo dos tokens');
    await act(async () => live.querySelector<HTMLElement>('[data-testid=controls-toggle]')!.click());
    expect(live.querySelector('.sb-controls-fields')?.getAttribute('aria-label')).toBe('Controles da prévia');
    expectNoEnglish();
  });

  it('bloco de tokens sem nenhum token publicado', async () => {
    await renderAt('/docs/fundamentos/cor/blocos', { ...dataSource, getTokens: async () => null });
    const none = await until(() => container.querySelector<HTMLElement>('[data-group=""] [role=note]'));
    expect(none.textContent).toBe('Nenhum design token publicado ainda.');
    expectNoEnglish();
  });
});
