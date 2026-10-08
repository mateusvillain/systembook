// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenValue } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { colorScaleParents } from './ColorScales.js';
import { TokenGroup } from './TokenGroup.js';

const dom = setupDom();

const color = (path: string, light: TokenValue, dark: TokenValue = light): Token => ({
  path,
  type: 'color',
  byMode: { light: { value: light, resolvedValue: light }, dark: { value: dark, resolvedValue: dark } },
});

const INDIGO = [color('palette.indigo.600', '#4f46e5'), color('palette.indigo.50', '#eef2ff'), color('palette.indigo.300', '#a5b4fc')];

describe('colorScaleParents (SYS-153)', () => {
  it('pai com duas ou mais cores de nome numérico; passo único, nome misto e outros tipos não', () => {
    const tokens: Token[] = [
      ...INDIGO,
      color('palette.white', '#fff'),
      color('palette.red.400', '#f87171'),
      color('palette.red.600', '#dc2626'),
      color('palette.green.400', '#4ade80'),
      color('role.primary', '#4f46e5'),
      color('role.on-primary', '#fff'),
      color('role.neutral', '#666'),
      color('mixed.100', '#111'),
      color('mixed.200', '#222'),
      color('mixed.strong', '#333'),
      { path: 'space.1', type: 'dimension', byMode: { light: { value: '4px', resolvedValue: '4px' }, dark: { value: '4px', resolvedValue: '4px' } } },
      { path: 'space.2', type: 'dimension', byMode: { light: { value: '8px', resolvedValue: '8px' }, dark: { value: '8px', resolvedValue: '8px' } } },
      { path: 'space.3', type: 'dimension', byMode: { light: { value: '12px', resolvedValue: '12px' }, dark: { value: '12px', resolvedValue: '12px' } } },
    ];
    expect([...colorScaleParents(tokens)]).toEqual(['palette.indigo', 'palette.red']);
  });
});

describe('TokenGroup com escalas (SYS-153)', () => {
  it('escala vira faixa em ordem numérica; as outras cores seguem na tabela', () => {
    dom.render(<TokenGroup tokens={[...INDIGO, color('palette.white', '#fff')]} modes={['light', 'dark']} label="palette" />);
    const scale = dom.container().querySelector<HTMLElement>('section.sb-color-scale')!;
    expect(scale.getAttribute('aria-label')).toBe('palette.indigo');
    const steps = [...scale.querySelectorAll('[role=listitem]')];
    expect(steps.map((s) => s.querySelector('.sb-color-scale-step-name')!.textContent)).toEqual(['50', '300', '600']);
    expect(steps.map((s) => s.querySelector('.sb-token-value')!.textContent)).toEqual(['#eef2ff', '#a5b4fc', '#4f46e5']);
    expect(steps[0]!.querySelector<HTMLElement>('.sb-color-scale-swatch')!.style.getPropertyValue('--sb-token-color')).toBe('#eef2ff');
    // copiar por passo, com o caminho inteiro
    expect(steps[2]!.querySelector('.sb-token-copy-button')!.getAttribute('title')).toBe('var(--palette-indigo-600)');
    // igual nos dois modos: uma faixa, sem rótulo de modo
    expect(scale.querySelectorAll('[role=list]')).toHaveLength(1);
    expect(dom.container().querySelector('[role=group]')!.getAttribute('aria-label')).toBe('palette (color scales)');
    expect([...dom.container().querySelectorAll('table tbody th')].map((th) => th.textContent)).toEqual(['palette.white']);
  });

  it('passo sem conversão: quadro tracejado, sem xadrez, e o valor cru', () => {
    const tokens = [color('ramp.100', '#eee'), color('ramp.200', { colorSpace: 'nope', components: [1, 1, 1] })];
    dom.render(<TokenGroup tokens={tokens} modes={['light']} label="ramp" />);
    const [, broken] = [...dom.container().querySelectorAll('[role=listitem]')];
    expect(broken!.querySelector('.sb-color-scale-swatch--missing')).not.toBeNull();
    expect(broken!.querySelector('.sb-token-color')).toBeNull();
    expect(broken!.querySelector('.sb-token-value')!.textContent).toBe('{"colorSpace":"nope","components":[1,1,1]}');
  });

  it('escala que muda com o modo: uma faixa por modo', () => {
    const tokens = [color('ramp.100', '#eee', '#111'), color('ramp.200', '#ddd', '#222'), color('ramp.300', '#ccc', '#333')];
    dom.render(<TokenGroup tokens={tokens} modes={['light', 'dark']} label="ramp" />);
    const rows = [...dom.container().querySelectorAll('[role=list]')];
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['ramp (light)', 'ramp (dark)']);
    expect(rows[1]!.querySelector('.sb-token-value')!.textContent).toBe('#111');
  });
});
