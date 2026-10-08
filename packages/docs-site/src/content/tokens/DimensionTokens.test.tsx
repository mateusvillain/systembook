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
    expect(samples('border-width')).toEqual(['1px', '2px', '3px', '2px']);
    expect(samples('radius')).toEqual(['4px']);
    expect(samples('size')).toEqual(['6px']);
  });

  it('convenções por nome (SYS-154): breakpoint, ícone/avatar, letter-spacing, line-height, blur', () => {
    dom.render(
      <DimensionTokens
        tokens={[
          token('breakpoint.md', '768px'),
          token('screens.xl', '80rem'),
          token('icon.size.md', '20px'),
          token('avatarLg', '48px'),
          token('letterSpacing.tight', '-0.02em'),
          token('tracking.wide', '0.5px'),
          token('line-height.body', '24px'),
          token('line-height.broken', '-4px'),
          token('blur.md', '8px'),
          token('shadow.blur', '8px'),
          token('icon.gap', '4px'),
        ]}
        modes={['default']}
      />,
    );
    const marks = [...dom.container().querySelectorAll<HTMLElement>('.sb-token-ruler-mark')].map((m) => m.style.getPropertyValue('--sb-token-ruler'));
    // 768px na escala do maior (80rem = 1280px)
    expect(marks).toEqual(['60%', '100%']);
    expect(samples('square')).toEqual(['20px', '48px']);
    const texts = [...dom.container().querySelectorAll<HTMLElement>('.sb-token-text-sample')];
    expect(texts.map((t) => t.style.letterSpacing || t.style.lineHeight)).toEqual(['-0.02em', '0.5px', '24px']);
    expect(samples('blur')).toEqual(['8px']);
    // `shadow.blur` é campo de sombra e `icon.gap` é espaço: barra
    expect(samples('size')).toEqual(['8px', '4px']);
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
