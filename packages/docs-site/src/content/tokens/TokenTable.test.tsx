// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { TokenTable } from './TokenTable.js';

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
});

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
  ['strokeStyle', { dashArray: ['2px', '4px'], lineCap: 'round' }, ['dashArray: 2px 4px', 'lineCap: round']],
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
    act(() => root.render(<TokenTable tokens={CASES.map(([type, value]) => token(type, value))} modes={['default']} />));
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(CASES.length);
    rows.forEach((row, i) => {
      const [type, , lines] = CASES[i]!;
      expect(row.querySelector('th')!.textContent).toBe(`t.${type}`);
      expect([...row.querySelectorAll('.sb-token-value')].map((c) => c.textContent)).toEqual(lines);
    });
    expect(container.querySelector('.sb-token-swatch')).toBeNull();
  });

  it('valor sem conversão cai no JSON', () => {
    act(() => root.render(<TokenTable tokens={[token('border', { color: '#000' })]} modes={['default']} />));
    expect(container.querySelector('.sb-token-value')!.textContent).toBe('{"color":"#000"}');
  });
});
