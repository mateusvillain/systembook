// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { FontTokens } from './FontTokens.js';

const dom = setupDom();

const token = (path: string, type: TokenType, light: TokenValue, dark: TokenValue = light): Token => ({
  path,
  type,
  byMode: { light: { value: light, resolvedValue: light }, dark: { value: dark, resolvedValue: dark } },
});

const samples = () => [...dom.container().querySelectorAll<HTMLElement>('.sb-token-type-sample')];

describe('FontTokens', () => {
  it('fontFamily e fontWeight aplicam só a propriedade deles; sem variação, uma coluna Value', () => {
    dom.render(
      <FontTokens
        tokens={[token('font.sans', 'fontFamily', ['Inter Variable', 'system-ui']), token('font.bold', 'fontWeight', 'Semi Bold')]}
        modes={['light', 'dark']}
      />,
    );
    expect([...dom.container().querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Token', 'Value', 'Details']);
    const [family, weight] = samples();
    expect(samples()).toHaveLength(2);
    expect(family!.getAttribute('aria-hidden')).toBe('true');
    expect(family!.style.fontFamily).toBe('"Inter Variable", system-ui');
    expect(family!.style.fontWeight).toBe('');
    expect(weight!.style.fontWeight).toBe('600');
    expect(weight!.style.fontFamily).toBe('');
  });

  it('um peso que muda com o modo abre as colunas por modo', () => {
    dom.render(<FontTokens tokens={[token('font.body', 'fontWeight', 400, 300)]} modes={['light', 'dark']} />);
    expect([...dom.container().querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Token', 'light', 'dark', 'Details']);
    expect(samples().map((s) => s.style.fontWeight)).toEqual(['400', '300']);
  });

  it('outros tipos ficam sem amostra', () => {
    dom.render(<FontTokens tokens={[token('n', 'number', 1)]} modes={['light', 'dark']} />);
    expect(samples()).toHaveLength(0);
  });
});
