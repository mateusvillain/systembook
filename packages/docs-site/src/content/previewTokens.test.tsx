// @vitest-environment jsdom
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { DocsDataSource, TokenSet } from '@systembook/schema';
import { tokensToCss } from '@systembook/content/tokens';
import { setupDom } from '../../test/dom.js';
import { DocsDataSourceProvider } from './dataSource.js';
import { docsQueryKeys } from './docsQueries.js';
import { PageRenderer } from '../public/PageRenderer.js';

const dom = setupDom();

const SNAPSHOT = {
  tabs: [
    {
      tabId: 't',
      titulo: 'Overview',
      isPrimary: true,
      blocks: [{ id: 'b', type: 'component-embed', ordem: 0, content: { componentName: 'Button', variantId: 'primary' } }],
    },
  ],
};

const color = (byMode: Record<string, string>) =>
  Object.fromEntries(Object.entries(byMode).map(([m, v]) => [m, { value: v, resolvedValue: v }]));

const TWO_MODES: TokenSet = {
  modes: ['light', 'dark'],
  tokens: [{ path: 'color.bg', type: 'color', byMode: color({ light: '#fff', dark: '#000' }) }],
};

const ONE_MODE: TokenSet = {
  modes: ['default'],
  tokens: [{ path: 'color.bg', type: 'color', byMode: color({ default: '#fff' }) }],
};

/** Um embed `live` sobre uma fonte com o preview e os tokens dados. */
async function renderEmbed(tokens: TokenSet | null) {
  const dataSource = {
    getComponentPreview: async () => ({ url: '/previews/button/primary/index.html', config: null }),
    getTokens: async () => tokens,
  } as unknown as DocsDataSource;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await dom.render(
    <QueryClientProvider client={client}>
      <DocsDataSourceProvider dataSource={dataSource}>
        <PageRenderer snapshot={SNAPSHOT} />
      </DocsDataSourceProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.waitFor(() => {
      if (!dom.container().querySelector('iframe')) throw new Error('carregando');
      if (client.getQueryState(docsQueryKeys.tokens())?.status !== 'success') throw new Error('tokens');
    });
  });
  const iframe = dom.container().querySelector('iframe')!;
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation(() => {});
  return { iframe, post };
}

const toggle = () => dom.container().querySelector('[data-testid="preview-mode"]');
const option = (mode: string) =>
  [...dom.container().querySelectorAll<HTMLButtonElement>('.sb-preview-mode-option')].find((b) => b.textContent === mode)!;

describe('modo dos tokens no preview (SYS-148)', () => {
  it('envia CSS e o primeiro modo no load do iframe; o toggle troca o modo', async () => {
    const { iframe, post } = await renderEmbed(TWO_MODES);
    const css = tokensToCss(TWO_MODES);

    await act(async () => iframe.dispatchEvent(new Event('load')));
    expect(post).toHaveBeenLastCalledWith({ type: 'systembook:set-tokens', css, mode: 'light' }, '*');

    expect(toggle()).not.toBeNull();
    expect(option('light').getAttribute('aria-pressed')).toBe('true');
    await act(async () => option('dark').click());
    expect(option('dark').getAttribute('aria-pressed')).toBe('true');
    expect(post).toHaveBeenLastCalledWith({ type: 'systembook:set-tokens', css, mode: 'dark' }, '*');

    // recarga do iframe (ex.: navegação dentro dele) reenvia o modo escolhido
    post.mockClear();
    await act(async () => iframe.dispatchEvent(new Event('load')));
    expect(post).toHaveBeenCalledWith({ type: 'systembook:set-tokens', css, mode: 'dark' }, '*');
  });

  it('um modo só: sem toggle, mas os tokens vão ao iframe', async () => {
    const { iframe, post } = await renderEmbed(ONE_MODE);
    expect(toggle()).toBeNull();
    await act(async () => iframe.dispatchEvent(new Event('load')));
    expect(post).toHaveBeenLastCalledWith({ type: 'systembook:set-tokens', css: tokensToCss(ONE_MODE), mode: 'default' }, '*');
  });

  it('sem tokens: sem toggle e nenhuma mensagem', async () => {
    const { iframe, post } = await renderEmbed(null);
    expect(toggle()).toBeNull();
    await act(async () => iframe.dispatchEvent(new Event('load')));
    expect(post).not.toHaveBeenCalled();
  });
});
