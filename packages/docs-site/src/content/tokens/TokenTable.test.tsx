// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setupDom } from '../../../test/dom.js';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { TokenTable } from './TokenTable.js';

const dom = setupDom();

const token = (type: TokenType, value: TokenValue): Token => ({
  path: `t.${type}`,
  type,
  byMode: { default: { value, resolvedValue: value } },
});

/** Um token de cada tipo, com o que a tabela de fallback mostra. */
const CASES: [TokenType, TokenValue, string[]][] = [
  ['color', '#0a84ff', ['#0a84ff']],
  ['dimension', 16, ['16px']],
  ['fontFamily', ['Inter', 'sans-serif'], ['Inter, sans-serif']],
  ['fontWeight', 'Semi Bold', ['600']],
  ['duration', '200ms', ['200ms']],
  ['cubicBezier', [0.2, 0, 0, 1], ['cubic-bezier(0.2, 0, 0, 1)']],
  ['number', 1.5, ['1.5']],
  ['strokeStyle', { dashArray: ['2px', '4px'], lineCap: 'round' }, ['stroke-dasharray: 2px 4px', 'stroke-linecap: round']],
  ['border', { color: '#000', width: '1px', style: 'solid' }, ['1px solid #000']],
  ['transition', { duration: '200ms', delay: '0ms', timingFunction: 'ease' }, ['200ms ease 0ms']],
  [
    'shadow',
    [
      { color: '#0002', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
      { color: '#0001', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
    ],
    ['0 1px 2px 0 #0002', '0 4px 8px 0 #0001'],
  ],
  ['gradient', [{ color: '#000', position: 0 }, { color: '#fff', position: 1 }], ['linear-gradient(90deg, #000 0%, #fff 100%)']],
  [
    'typography',
    { fontFamily: 'Inter', fontSize: '16px', fontWeight: 400, letterSpacing: '0px', lineHeight: 1.5 },
    ['font-family: Inter', 'font-size: 16px', 'font-weight: 400', 'letter-spacing: 0px', 'line-height: 1.5'],
  ],
];

describe('TokenTable como fallback (SYS-136)', () => {
  it('renderiza qualquer tipo, com os compostos legíveis', () => {
    dom.render((<TokenTable tokens={CASES.map(([type, value]) => token(type, value))} modes={['default']} />));
    const rows = [...dom.container().querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(CASES.length);
    rows.forEach((row, i) => {
      const [type, , lines] = CASES[i]!;
      expect(row.querySelector('th')!.textContent).toBe(`t.${type}`);
      expect([...row.querySelectorAll('.sb-token-value')].map((c) => c.textContent)).toEqual(lines);
    });
    expect(dom.container().querySelector('.sb-token-swatch')).toBeNull();
  });

  it('mostra o tipo de cada token em Details', () => {
    dom.render(<TokenTable tokens={[token('number', 1)]} modes={['default']} />);
    expect(dom.container().querySelector('.sb-token-details .sb-token-type')!.textContent).toBe('number');
  });

  it('tipo fora de TokenType (schema mais novo) não derruba a tabela: o valor sai em JSON', () => {
    dom.render(<TokenTable tokens={[token('futureType' as TokenType, { a: 1 }), token('number', 2)]} modes={['default']} />);
    expect([...dom.container().querySelectorAll('.sb-token-value')].map((c) => c.textContent)).toEqual(['{"a":1}', '2']);
  });

  it('valor sem conversão cai no JSON', () => {
    dom.render((<TokenTable tokens={[token('border', { color: '#000' })]} modes={['default']} />));
    expect(dom.container().querySelector('.sb-token-value')!.textContent).toBe('{"color":"#000"}');
  });

  it('colunas por modo só quando algum valor ou alias muda entre eles', () => {
    const twoModes = (path: string, light: TokenValue, dark: TokenValue, darkAlias?: string): Token => ({
      path,
      type: 'number',
      byMode: { light: { value: light, resolvedValue: light }, dark: { value: dark, resolvedValue: dark, ...(darkAlias ? { aliasOf: darkAlias } : {}) } },
    });
    const headers = () => [...dom.container().querySelectorAll('thead th')].map((th) => th.textContent);

    dom.render(<TokenTable tokens={[twoModes('a', 1, 1), twoModes('b', 2, 2)]} modes={['light', 'dark']} />);
    expect(headers()).toEqual(['Token', 'Value', 'Details']);
    expect(dom.container().querySelectorAll('tbody td.sb-token-cell')).toHaveLength(2);

    dom.render(<TokenTable tokens={[twoModes('a', 1, 1), twoModes('b', 2, 3)]} modes={['light', 'dark']} />);
    expect(headers()).toEqual(['Token', 'light', 'dark', 'Details']);

    // A linha que não muda ocupa as colunas de modo numa célula só.
    const cells = (path: string) => [...dom.container().querySelectorAll('tbody tr')].find((r) => r.querySelector('th')!.textContent === path)!.querySelectorAll('td.sb-token-cell');
    expect(cells('b')).toHaveLength(2);
    expect(cells('a')).toHaveLength(1);
    expect(cells('a')[0]!.getAttribute('colspan')).toBe('2');
    expect(cells('a')[0]!.querySelector('.sb-token-all-modes')!.textContent).toBe('Same in all modes');
    expect(cells('b')[0]!.querySelector('.sb-token-all-modes')).toBeNull();

    // Mesmo valor por caminhos diferentes também é diferença: o alias aparece.
    dom.render(<TokenTable tokens={[twoModes('a', 1, 1, 'x.one')]} modes={['light', 'dark']} />);
    expect(headers()).toEqual(['Token', 'light', 'dark', 'Details']);
  });
});
