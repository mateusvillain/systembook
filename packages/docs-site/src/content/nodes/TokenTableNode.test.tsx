// @vitest-environment jsdom
import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { DocsDataSource, TokenSet } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { DocsDataSourceProvider } from '../dataSource.js';
import { PageRenderer } from '../../public/PageRenderer.js';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { createContentExtensions } from '../extensions.js';
import type { TokenTableEditControlsProps } from './TokenTableNode.js';

const dom = setupDom();

const SNAPSHOT = {
  tabs: [{ tabId: 't', titulo: 'Overview', isPrimary: true, blocks: [{ id: 'b', type: 'token-table', ordem: 0, content: { group: '' } }] }],
};

const TOKENS: TokenSet = {
  modes: ['default'],
  tokens: [
    { path: 'space.1', type: 'dimension', byMode: { default: { value: '4px', resolvedValue: '4px' } } },
    { path: 'color.fg', type: 'color', byMode: { default: { value: '#111', resolvedValue: '#111' } } },
    { path: 'font.weight.bold', type: 'fontWeight', byMode: { default: { value: 700, resolvedValue: 700 } } },
    {
      path: 'shadow.card',
      type: 'shadow',
      byMode: {
        default: {
          value: { color: '#0003', offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' },
          resolvedValue: { color: '#0003', offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' },
        },
      },
    },
    { path: 'font.family.sans', type: 'fontFamily', byMode: { default: { value: 'Inter', resolvedValue: 'Inter' } } },
    { path: 'motion.fast', type: 'duration', byMode: { default: { value: '100ms', resolvedValue: '100ms' } } },
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
      'All tokens (fontWeight, fontFamily)',
      'All tokens (shadow)',
      'All tokens (duration)',
    ]);
    // cada uma com a amostra do seu renderer; o fallback, sem amostra
    expect(block.querySelectorAll('.sb-token-type-sample')).toHaveLength(2);
    expect(block.querySelector('table[aria-label="All tokens (shadow)"] .sb-token-cell')!.children.length).toBeGreaterThan(1);
    expect(block.querySelector('table[aria-label="All tokens (duration)"] .sb-token-cell')!.children).toHaveLength(1);
  });

  it('sem nenhum token publicado, aviso no lugar', async () => {
    const none = await renderBlock(async () => null);
    expect(none.dataset.state).toBe('empty');
    expect(none.textContent).toBe('No design tokens published yet.');
  });

  it('erro na leitura vira aviso, sem quebrar a página', async () => {
    const failed = await renderBlock(() => Promise.reject(new Error('rede')));
    expect(failed.dataset.state).toBe('error');
    expect(failed.textContent).toBe('Could not load the design tokens.');
  });
});

describe('seletor de grupo no editor (SYS-138)', () => {
  /** Controle stub: registra as props e escolhe `space` ao clicar. */
  const seen: TokenTableEditControlsProps[] = [];
  function Picker(props: TokenTableEditControlsProps) {
    seen.push(props);
    return <button type="button" onClick={() => props.onSelect('space')}>pick</button>;
  }
  const extensions = createContentExtensions({ tokenTable: { EditControls: Picker } });

  async function renderEditor(editable: boolean, getTokens: DocsDataSource['getTokens']) {
    seen.length = 0;
    let editor: Editor | null = null;
    function Host() {
      editor = useEditor({ extensions, editable, content: { type: 'doc', content: [{ type: 'tokenTable', attrs: { group: 'color' } }] } });
      return <EditorContent editor={editor} />;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await dom.render(
      <QueryClientProvider client={client}>
        <DocsDataSourceProvider dataSource={{ getTokens } as DocsDataSource}>
          <Host />
        </DocsDataSourceProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      await vi.waitFor(() => {
        if (!dom.container().querySelector('.sb-token-block:not([data-state=loading])')) throw new Error('carregando');
      });
    });
    return () => editor!;
  }

  it('editando: recebe os grupos e troca o grupo do nó', async () => {
    const editor = await renderEditor(true, async () => TOKENS);
    expect(seen.at(-1)).toMatchObject({ group: 'color', groups: ['space', 'color', 'font', 'font.weight', 'shadow', 'font.family', 'motion'], hasTokens: true, loading: false });
    await act(async () => dom.container().querySelector<HTMLButtonElement>('.sb-token-block-bar button')!.click());
    expect(editor().getJSON().content![0]).toEqual({ type: 'tokenTable', attrs: { group: 'space' } });
  });

  it('sem tokens, o seletor sabe que não há o que escolher', async () => {
    await renderEditor(true, async () => null);
    expect(seen.at(-1)).toMatchObject({ groups: [], hasTokens: false, loading: false });
  });

  it('read-only não mostra o seletor', async () => {
    await renderEditor(false, async () => TOKENS);
    expect(seen).toEqual([]);
    expect(dom.container().querySelector('.sb-token-block-bar')).toBeNull();
  });
});
