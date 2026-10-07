// @vitest-environment jsdom
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { DocsDataSource, TokenSet } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { DocsDataSourceProvider } from '../dataSource.js';
import { PageRenderer } from '../../public/PageRenderer.js';

const dom = setupDom();

const SNAPSHOT = {
  tabs: [{ tabId: 't', titulo: 'Overview', isPrimary: true, blocks: [{ id: 'b', type: 'token-table', ordem: 0, content: { group: '' } }] }],
};

const TOKENS: TokenSet = {
  modes: ['default'],
  tokens: [
    { path: 'space.1', type: 'dimension', byMode: { default: { value: '4px', resolvedValue: '4px' } } },
    { path: 'color.fg', type: 'color', byMode: { default: { value: '#111', resolvedValue: '#111' } } },
  ],
};

/** O bloco `token-table` sem grupo sobre uma fonte que só implementa `getTokens`. */
async function renderBlock(getTokens: DocsDataSource['getTokens']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await dom.render(
    <QueryClientProvider client={client}>
      <DocsDataSourceProvider dataSource={{ getTokens } as DocsDataSource}>
        <PageRenderer snapshot={SNAPSHOT} />
      </DocsDataSourceProvider>
    </QueryClientProvider>,
  );
  await act(async () => {
    await vi.waitFor(() => {
      if (dom.container().querySelector('.sb-token-block[data-state=loading]') || !dom.container().querySelector('.sb-token-block'))
        throw new Error('carregando');
    });
  });
  return dom.container().querySelector<HTMLElement>('.sb-token-block')!;
}

describe('bloco token-table (SYS-139)', () => {
  it('sem grupo: todos os tokens, uma tabela por renderer', async () => {
    const block = await renderBlock(async () => TOKENS);
    expect([...block.querySelectorAll('table')].map((t) => t.getAttribute('aria-label'))).toEqual([
      'All tokens (dimension)',
      'All tokens (color)',
    ]);
  });

  it('sem nenhum token publicado, aviso no lugar', async () => {
    const none = await renderBlock(async () => null);
    expect(none.dataset.state).toBe('empty');
    expect(none.textContent).toBe('No design tokens published yet.');
  });

  it('erro na leitura vira aviso, sem quebrar a página', async () => {
    const failed = await renderBlock(() => Promise.reject(new Error('rede')));
    expect(failed.dataset.state).toBe('empty');
    expect(failed.textContent).toBe('Could not load the design tokens.');
  });
});
