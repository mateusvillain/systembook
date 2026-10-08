// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { GradientTokens } from './GradientTokens.js';
import { StrokeTokens } from './StrokeTokens.js';

const dom = setupDom();

const token = (path: string, type: TokenType, value: TokenValue): Token => ({
  path,
  type,
  byMode: { default: { value, resolvedValue: value } },
});

const sample = (kind: string) =>
  [...dom.container().querySelectorAll<HTMLElement>(`.sb-token-${kind}`)].map((el) => el.style.getPropertyValue(`--sb-token-${kind}`));

describe('StrokeTokens (SYS-152)', () => {
  it('border vira caixa com a borda inteira; strokeStyle, linha com o estilo', () => {
    dom.render(
      <StrokeTokens
        tokens={[
          token('border.default', 'border', { color: '#d0d7de', width: 1, style: 'solid' }),
          token('border.style.dashed', 'strokeStyle', 'Dashed'),
          token('border.style.double', 'strokeStyle', 'double'),
        ]}
        modes={['default']}
      />,
    );
    expect(sample('border')).toEqual(['1px solid #d0d7de']);
    expect(sample('stroke')).toEqual(['dashed', 'double']);
    expect(dom.container().querySelector('.sb-token-border')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('dashArray vira linha em SVG com os traços e as pontas', () => {
    dom.render(
      <StrokeTokens tokens={[token('border.style.focus', 'strokeStyle', { dashArray: ['4px', { value: 0.25, unit: 'rem' }], lineCap: 'round' })]} modes={['default']} />,
    );
    const line = dom.container().querySelector<SVGLineElement>('svg.sb-token-dash line')!;
    expect(line.style.strokeDasharray).toBe('4px 0.25rem');
    expect(line.style.strokeLinecap).toBe('round');
    expect(dom.container().querySelector('.sb-token-stroke')).toBeNull();
  });

  it('sem amostra quando não converte', () => {
    dom.render(<StrokeTokens tokens={[token('border.broken', 'border', { color: '#000' })]} modes={['default']} />);
    expect(dom.container().querySelectorAll('.sb-token-border, .sb-token-stroke, .sb-token-dash')).toHaveLength(0);
  });
});

describe('GradientTokens (SYS-152)', () => {
  it('faixa com o gradiente; sem amostra quando não converte', () => {
    dom.render(
      <GradientTokens
        tokens={[
          token('gradient.brand', 'gradient', [
            { color: '#4f46e5', position: 0 },
            { color: '#a5b4fc', position: 1 },
          ]),
          token('gradient.broken', 'gradient', [{ color: '#000' }]),
        ]}
        modes={['default']}
      />,
    );
    expect(sample('gradient')).toEqual(['linear-gradient(90deg, #4f46e5 0%, #a5b4fc 100%)']);
  });
});
