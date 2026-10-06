import { describe, expect, it } from 'vitest';
import { checkCssVarCollisions, findCssVarCollisions, toCssVar, toJsPath } from './names.js';

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
    ['cor.cafe\u0301', '--cor-café'],
    ['x.brandÉclair', '--x-brand-éclair'],
    ['icon.😀x', '--icon-😀x'],
    ['a.@@.x', '--a-40-40-x'],
    ['a.b:c;d(e)!#"', '--a-b-c-d-e'],
    ['accent.$root', '--accent'],
  ])('%s → %s', (path, expected) => {
    expect(toCssVar(path)).toBe(expected);
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
    ['default.x', 'tokens.default.x'],
    ['cor.ação', 'cor.ação'],
    ['n.99999999999999999999', 'n["99999999999999999999"]'],
    ['n.1e3', 'n["1e3"]'],
    ['n.-1', 'n["-1"]'],
  ])('%s → %s', (path, expected) => {
    expect(toJsPath(path)).toBe(expected);
  });
});

describe('colisões de variável CSS', () => {
  it('acha os caminhos que geram a mesma variável', () => {
    expect([...findCssVarCollisions(['color.brandPrimary', 'color.brand-primary', 'color.blue'])]).toEqual([
      ['--color-brand-primary', ['color.brandPrimary', 'color.brand-primary']],
    ]);
  });

  it('checkCssVarCollisions avisa no token que repete a variável', () => {
    expect(
      checkCssVarCollisions([
        { path: 'color.brandPrimary', file: 'a.json' },
        { path: 'color.Brand-Primary', file: 'b.json' },
      ]),
    ).toEqual([
      {
        severity: 'warning',
        file: 'b.json',
        path: 'color.Brand-Primary',
        message: 'gera a mesma variável CSS de color.brandPrimary (--color-brand-primary); renomeie um dos dois.',
      },
    ]);
  });
});
