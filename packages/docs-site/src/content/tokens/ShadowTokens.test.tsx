// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { ShadowTokens } from './ShadowTokens.js';

const dom = setupDom();

const token = (path: string, value: TokenValue, type: TokenType = 'shadow'): Token => ({
  path,
  type,
  byMode: { default: { value, resolvedValue: value } },
});

describe('ShadowTokens', () => {
  it('cartão numa bandeja, com o box-shadow do valor, camadas inclusive', () => {
    dom.render(
      <ShadowTokens
        tokens={[
          token('shadow.card', { color: '#0f172a1f', offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px' }),
          token('shadow.stack', [
            { color: '#0002', offsetX: 0, offsetY: 1, blur: 2, spread: 0, inset: true },
            { color: '#0001', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
          ]),
        ]}
        modes={['default']}
      />,
    );
    const cards = [...dom.container().querySelectorAll<HTMLElement>('.sb-token-shadow-tray > .sb-token-shadow')];
    expect(cards.map((c) => c.style.getPropertyValue('--sb-token-shadow'))).toEqual([
      '0px 2px 8px 0px #0f172a1f',
      'inset 0 1px 2px 0 #0002, 0 4px 8px 0 #0001',
    ]);
    expect(cards[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(dom.container().querySelectorAll('tbody tr')[1]!.querySelectorAll('.sb-token-value')).toHaveLength(2);
    expect(dom.container().querySelectorAll('.sb-token-copy-button')).toHaveLength(6);
  });

  it('outro tipo, ou sombra sem conversão, fica sem cartão', () => {
    dom.render(<ShadowTokens tokens={[token('c', '#000', 'color'), token('s', { color: '#000' })]} modes={['default']} />);
    expect(dom.container().querySelectorAll('.sb-token-shadow')).toHaveLength(0);
  });
});
