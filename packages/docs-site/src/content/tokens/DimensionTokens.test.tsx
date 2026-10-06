// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { DimensionTokens } from './DimensionTokens.js';
import { ShadowTokens } from './ShadowTokens.js';

const dom = setupDom();

const token = (path: string, type: TokenType, value: TokenValue): Token => ({
  path,
  type,
  byMode: { default: { value, resolvedValue: value } },
});

const prop = (selector: string, name: string) =>
  [...dom.container().querySelectorAll<HTMLElement>(selector)].map((el) => el.style.getPropertyValue(name));

describe('DimensionTokens', () => {
  it('espaçamento vira barra; raio, pelo caminho, vira quadrado arredondado', () => {
    dom.render(
      <DimensionTokens
        tokens={[
          token('space.4', 'dimension', '16px'),
          token('space.lg', 'dimension', { value: 1.5, unit: 'rem' }),
          token('radius.md', 'dimension', '8px'),
          token('acme.rounded.full', 'dimension', '9999px'),
        ]}
        modes={['default']}
      />,
    );
    expect(prop('.sb-token-size', '--sb-token-size')).toEqual(['16px', '1.5rem']);
    expect(prop('.sb-token-radius', '--sb-token-radius')).toEqual(['8px', '9999px']);
    expect(dom.container().querySelector('.sb-token-size')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('valor negativo e outros tipos ficam sem amostra, só escritos', () => {
    dom.render(<DimensionTokens tokens={[token('space.neg', 'dimension', '-4px'), token('n', 'number', 2)]} modes={['default']} />);
    expect(dom.container().querySelectorAll('.sb-token-size, .sb-token-radius')).toHaveLength(0);
    expect([...dom.container().querySelectorAll('.sb-token-value')].map((v) => v.textContent)).toEqual(['-4px', '2']);
  });
});

describe('ShadowTokens', () => {
  it('cartão com o box-shadow do valor, camadas inclusive', () => {
    dom.render(
      <ShadowTokens
        tokens={[
          token('shadow.card', 'shadow', { color: '#0f172a1f', offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px' }),
          token('shadow.stack', 'shadow', [
            { color: '#0002', offsetX: 0, offsetY: 1, blur: 2, spread: 0, inset: true },
            { color: '#0001', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
          ]),
        ]}
        modes={['default']}
      />,
    );
    expect(prop('.sb-token-shadow', '--sb-token-shadow')).toEqual(['0px 2px 8px 0px #0f172a1f', 'inset 0 1px 2px 0 #0002, 0 4px 8px 0 #0001']);
    expect(dom.container().querySelectorAll('tbody tr')[1]!.querySelectorAll('.sb-token-value')).toHaveLength(2);
  });
});
