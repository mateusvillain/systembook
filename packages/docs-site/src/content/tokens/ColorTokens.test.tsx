// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Token } from '@systembook/schema';
import { ColorTokens } from './ColorTokens.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const mode = (value: string, resolvedValue = value, aliasOf?: string) =>
  aliasOf ? { value, resolvedValue, aliasOf } : { value, resolvedValue };

const TOKENS: Token[] = [
  {
    path: 'acme.primary',
    type: 'color',
    description: 'Ação principal.',
    byMode: {
      light: mode('{acme.palette.indigo.600}', '#4f46e5', 'acme.palette.indigo.600'),
      dark: mode('{acme.palette.indigo.400}', '#818cf8', 'acme.palette.indigo.400'),
    },
  },
  {
    path: 'acme.brand',
    type: 'color',
    deprecated: 'Use acme.primary.',
    byMode: { light: mode('#0003'), dark: { value: { colorSpace: 'srgb', components: [1, 0, 0], alpha: 0.5 }, resolvedValue: { colorSpace: 'srgb', components: [1, 0, 0], alpha: 0.5 } } },
  },
];

const render = (node: React.ReactNode) => act(() => root.render(node));

describe('ColorTokens', () => {
  it('uma coluna por modo, com swatch, valor e alias', () => {
    render(<ColorTokens tokens={TOKENS} modes={['light', 'dark']} label="Cores" />);
    const table = container.querySelector('table')!;
    expect(table.getAttribute('aria-label')).toBe('Cores');
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Token', 'light', 'dark']);

    const [primary, brand] = [...table.querySelectorAll('tbody tr')];
    expect(primary!.querySelector('.sb-token-name')!.textContent).toBe('acme.primary');
    expect(primary!.querySelector('.sb-token-description')!.textContent).toBe('Ação principal.');
    const cells = [...primary!.querySelectorAll('td')];
    expect(cells.map((td) => td.querySelector('.sb-token-value')!.textContent)).toEqual(['#4f46e5', '#818cf8']);
    expect(cells.map((td) => td.querySelector('.sb-token-alias')!.textContent)).toEqual([
      '→ acme.palette.indigo.600',
      '→ acme.palette.indigo.400',
    ]);
    const swatch = cells[0]!.querySelector<HTMLElement>('.sb-token-swatch')!;
    expect(swatch.style.getPropertyValue('--sb-token-color')).toBe('#4f46e5');
    expect(swatch.getAttribute('aria-hidden')).toBe('true');

    expect(brand!.hasAttribute('data-deprecated')).toBe(true);
    expect(brand!.querySelector('.sb-token-deprecated')!.textContent).toBe('Deprecated');
    expect(brand!.textContent).toContain('Use acme.primary.');
    expect([...brand!.querySelectorAll('.sb-token-value')].map((v) => v.textContent)).toEqual(['#0003', 'color(srgb 1 0 0 / 0.5)']);
    expect(brand!.querySelector('.sb-token-alias')).toBeNull();
  });

  it('modo único default: cabeçalho "Value"', () => {
    render(<ColorTokens tokens={[{ path: 'c', type: 'color', byMode: { default: mode('#fff') } }]} modes={['default']} />);
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Token', 'Value']);
  });

  it('copia a variável CSS, o acesso em JS e o caminho', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ColorTokens tokens={[TOKENS[0]!]} modes={['light', 'dark']} />);

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('.sb-token-copy-button')];
    expect(buttons.map((b) => [b.textContent, b.title])).toEqual([
      ['CSS', 'var(--acme-primary)'],
      ['JS', 'acme.primary'],
      ['Path', 'acme.primary'],
    ]);
    await act(async () => buttons[0]!.click());
    expect(writeText).toHaveBeenCalledWith('var(--acme-primary)');
    expect(buttons[0]!.textContent).toBe('Copied');
    expect(buttons[0]!.dataset.state).toBe('copied');
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Copied to clipboard');
  });
});
