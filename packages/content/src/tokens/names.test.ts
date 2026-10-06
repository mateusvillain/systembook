import { describe, expect, it } from 'vitest';
import { loadTokenSet } from './load.js';
import { findCssVarCollisions, toCssVar, toJsPath } from './names.js';

describe('toCssVar', () => {
  it.each([
    ['color.brand.500', '--color-brand-500'],
    ['color.brandPrimary', '--color-brand-primary'],
    ['font.HTMLBody', '--font-html-body'],
    ['space.2xl', '--space-2xl'],
    ['color.Brand Primary', '--color-brand-primary'],
    ['color.brand_primary', '--color-brand_primary'],
    ['color.brand--primary', '--color-brand-primary'],
    ['size.1/2', '--size-1-2'],
    ['cor.ação', '--cor-ação'],
    ['accent.$root', '--accent'],
  ])('%s → %s', (path, expected) => {
    expect(toCssVar(path)).toBe(expected);
  });

  it('com prefixo', () => {
    expect(toCssVar('color.brand.500', { prefix: 'ds' })).toBe('--ds-color-brand-500');
  });
});

describe('toJsPath', () => {
  it.each([
    ['color.brand.500', 'color.brand[500]'],
    ['color.brandPrimary', 'color.brandPrimary'],
    ['space.2xl', 'space["2xl"]'],
    ['space.05', 'space["05"]'],
    ["font.it's", 'font["it\'s"]'],
    ['size.1/2', 'size["1/2"]'],
    ['accent.$root', 'accent.$root'],
    ['2xl.gap', 'tokens["2xl"].gap'],
  ])('%s → %s', (path, expected) => {
    expect(toJsPath(path)).toBe(expected);
  });

  it('com raiz', () => {
    expect(toJsPath('color.brand.500', 'theme')).toBe('theme.color.brand[500]');
  });
});

describe('colisões de variável CSS', () => {
  it('acha os caminhos que geram a mesma variável', () => {
    expect([...findCssVarCollisions(['color.brandPrimary', 'color.brand-primary', 'color.blue'])]).toEqual([
      ['--color-brand-primary', ['color.brandPrimary', 'color.brand-primary']],
    ]);
  });

  it('loadTokenSet avisa no token que repete a variável', () => {
    const { set, diagnostics } = loadTokenSet([
      {
        file: 'tokens.json',
        content: JSON.stringify({ color: { $type: 'color', brandPrimary: { $value: '#00f' }, 'brand-primary': { $value: '#0af' } } }),
      },
    ]);
    expect(set.tokens).toHaveLength(2);
    expect(diagnostics).toEqual([
      {
        severity: 'warning',
        file: 'tokens.json',
        path: 'color.brand-primary',
        message: 'gera a mesma variável CSS de color.brandPrimary (--color-brand-primary); renomeie um dos dois.',
      },
    ]);
  });
});
