// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { DimensionTokens } from './DimensionTokens.js';

const dom = setupDom();

const token = (path: string, value: TokenValue, type: TokenType = 'dimension'): Token => ({
  path,
  type,
  byMode: { default: { value, resolvedValue: value } },
});

const samples = (kind: string) =>
  [...dom.container().querySelectorAll<HTMLElement>(`.sb-token-${kind}`)].map((el) => el.style.getPropertyValue(`--sb-token-${kind}`));

describe('DimensionTokens', () => {
  it('espaçamento vira barra; número puro em px; { value, unit }', () => {
    dom.render(
      <DimensionTokens
        tokens={[token('space.4', '16px'), token('space.lg', { value: 1.5, unit: 'rem' }), token('space.n', 8), token('space.none', 0)]}
        modes={['default']}
      />,
    );
    expect(samples('size')).toEqual(['16px', '1.5rem', '8px', '0']);
    expect(dom.container().querySelector('.sb-token-size')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('raio pelo caminho, por palavra inteira', () => {
    dom.render(
      <DimensionTokens
        tokens={[
          token('radius.md', '8px'),
          token('border.radius.sm', '4px'),
          token('md.sys.shape.corner.small', '8px'),
          token('acme.rounded-full', '9999px'),
          token('borderRadius.lg', '12px'),
          token('shadow.blur-radius', '24px'),
          token('focus.ring-radius', '2px'),
          token('spacing.radiusless', '4px'),
        ]}
        modes={['default']}
      />,
    );
    expect(samples('radius')).toEqual(['8px', '4px', '8px', '9999px', '12px']);
    expect(samples('size')).toEqual(['24px', '2px', '4px']);
  });

  it('largura de borda pelo caminho (SYS-150); raio de borda continua raio', () => {
    dom.render(
      <DimensionTokens
        tokens={[
          token('acme.border.width.thin', '1px'),
          token('strokeWidth.md', 2),
          token('focus.outline-width', '3px'),
          token('border.radius.sm', '4px'),
          token('stroke.md', '2px'),
          token('space.border-gap', '6px'),
        ]}
        modes={['default']}
      />,
    );
    expect(samples('border')).toEqual(['1px', '2px', '3px', '2px']);
    expect(samples('radius')).toEqual(['4px']);
    expect(samples('size')).toEqual(['6px']);
  });

  it('sem amostra quando ela mentiria: negativo, relativo, não comprimento, outro tipo', () => {
    dom.render(
      <DimensionTokens
        tokens={[
          token('space.neg', '-4px'),
          token('size.half', '50%'),
          token('size.screen', '100vw'),
          token('size.auto', 'auto'),
          token('size.raw', '16'),
          token('n', 2, 'number'),
        ]}
        modes={['default']}
      />,
    );
    expect(dom.container().querySelectorAll('.sb-token-size, .sb-token-radius')).toHaveLength(0);
    expect([...dom.container().querySelectorAll('.sb-token-value')].map((v) => v.textContent)).toEqual(['-4px', '50%', '100vw', 'auto', '16', '2']);
  });
});
