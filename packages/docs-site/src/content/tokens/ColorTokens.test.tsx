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
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Token', 'light', 'dark', 'Details']);

    const [primary, brand] = [...table.querySelectorAll('tbody tr')];
    // O cabeçalho da linha é só o nome: o leitor de tela o repete em cada célula.
    expect(primary!.querySelector('th')!.textContent).toBe('acme.primary');
    expect(primary!.querySelector('.sb-token-details .sb-token-description')!.textContent).toBe('Ação principal.');
    const cells = [...primary!.querySelectorAll('td.sb-token-cell')];
    expect(cells.map((td) => td.querySelector('.sb-token-value')!.textContent)).toEqual(['#4f46e5', '#818cf8']);
    expect(cells.map((td) => td.querySelector('.sb-token-alias')!.textContent)).toEqual([
      '→ acme.palette.indigo.600',
      '→ acme.palette.indigo.400',
    ]);
    const swatch = cells[0]!.querySelector<HTMLElement>('.sb-token-swatch')!;
    expect(swatch.style.getPropertyValue('--sb-token-color')).toBe('#4f46e5');
    expect(swatch.getAttribute('aria-hidden')).toBe('true');

    expect(brand!.hasAttribute('data-deprecated')).toBe(true);
    expect(brand!.querySelector('th')!.textContent).toBe('acme.brandDeprecated');
    expect(brand!.querySelector('.sb-token-deprecated-reason')!.textContent).toBe('Use acme.primary.');
    expect([...brand!.querySelectorAll('.sb-token-value')].map((v) => v.textContent)).toEqual(['#0003', 'color(srgb 1 0 0 / 0.5)']);
    expect(brand!.querySelector('.sb-token-alias')).toBeNull();
  });

  it('modo único default: cabeçalho "Value"', () => {
    render(<ColorTokens tokens={[{ path: 'c', type: 'color', byMode: { default: mode('#fff') } }]} modes={['default']} />);
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Token', 'Value', 'Details']);
  });

  it('cor sem conversão para CSS: sem swatch, com o JSON', () => {
    const value = { colorSpace: 'nope', components: [1, 0, 0] };
    render(<ColorTokens tokens={[{ path: 'c', type: 'color', byMode: { default: { value, resolvedValue: value } } }]} modes={['default']} />);
    expect(container.querySelector('.sb-token-swatch')).toBeNull();
    expect(container.querySelector('.sb-token-value')!.textContent).toBe(JSON.stringify(value));
  });

  it('copia a variável CSS, o acesso em JS e o caminho', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ColorTokens tokens={[TOKENS[0]!]} modes={['light', 'dark']} />);

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('.sb-token-copy-button')];
    expect(buttons.map((b) => [b.textContent, b.title, b.getAttribute('aria-label')])).toEqual([
      ['CSS', 'var(--acme-primary)', 'CSS: copy CSS variable var(--acme-primary)'],
      ['JS', 'acme.primary', 'JS: copy JS path acme.primary'],
      ['Path', 'acme.primary', 'Path: copy token path acme.primary'],
    ]);
    const status = () => container.querySelectorAll('[role="status"]');
    expect(status()).toHaveLength(1);

    await act(async () => buttons[0]!.click());
    expect(writeText).toHaveBeenCalledWith('var(--acme-primary)');
    expect(buttons[0]!.textContent).toBe('Copied');
    expect(buttons[0]!.getAttribute('aria-label')).toMatch(/^Copied: /);
    expect(status()[0]!.textContent).toBe('Copied CSS variable var(--acme-primary)');

    // A mesma cópia de novo muda o texto da região viva, para ser anunciada outra vez.
    await act(async () => buttons[0]!.click());
    expect(status()[0]!.textContent).not.toBe('Copied CSS variable var(--acme-primary)');
    expect(status()[0]!.textContent!.trim()).toBe('Copied CSS variable var(--acme-primary)');
  });

  it('falha ao copiar: o botão diz que falhou', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('x')) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);
    render(<ColorTokens tokens={[TOKENS[0]!]} modes={['light', 'dark']} />);
    const css = container.querySelector<HTMLButtonElement>('.sb-token-copy-button')!;
    await act(async () => css.click());
    expect(css.textContent).toBe('Failed');
    expect(container.querySelector('[role="status"]')!.textContent).toBe('Could not copy CSS variable — select var(--acme-primary) and copy it');
  });
});
