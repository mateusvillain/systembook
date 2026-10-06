// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { TypographyTokens } from './TypographyTokens.js';

const dom = setupDom();

const token = (path: string, type: TokenType, light: TokenValue, dark: TokenValue = light): Token => ({
  path,
  type,
  byMode: { light: { value: light, resolvedValue: light }, dark: { value: dark, resolvedValue: dark } },
});

const samples = () => [...dom.container().querySelectorAll<HTMLElement>('.sb-token-type-sample')];

describe('TypographyTokens', () => {
  it('typography aplica as propriedades na amostra, em cada modo', () => {
    dom.render(
      <TypographyTokens
        tokens={[
          token(
            'type.body',
            'typography',
            { fontFamily: ['Inter', 'sans-serif'], fontSize: '16px', fontWeight: 'bold', letterSpacing: '-0.5px', lineHeight: 1.5 },
            { fontFamily: 'Inter', fontSize: 18, fontWeight: 400, letterSpacing: 0, lineHeight: '28px' },
          ),
        ]}
        modes={['light', 'dark']}
      />,
    );
    const [light, dark] = samples();
    expect(light!.getAttribute('aria-hidden')).toBe('true');
    expect(light!.textContent).toBe('The quick brown fox jumps over the lazy dog');
    expect([light!.style.fontFamily, light!.style.fontSize, light!.style.fontWeight, light!.style.letterSpacing, light!.style.lineHeight]).toEqual([
      'Inter, sans-serif',
      '16px',
      '700',
      '-0.5px',
      '1.5',
    ]);
    expect([dark!.style.fontSize, dark!.style.lineHeight]).toEqual(['18px', '28px']);
    // O valor escrito continua lá, uma propriedade por linha.
    expect(dom.container().querySelectorAll('td.sb-token-cell')[0]!.querySelectorAll('.sb-token-value')).toHaveLength(5);
  });

  it('fontFamily e fontWeight aplicam só a propriedade deles', () => {
    dom.render(
      <TypographyTokens
        tokens={[token('font.sans', 'fontFamily', ['Inter Variable', 'system-ui']), token('font.bold', 'fontWeight', 'Semi Bold')]}
        modes={['light', 'dark']}
      />,
    );
    const [family, , weight] = samples();
    expect(family!.style.fontFamily).toBe('"Inter Variable", system-ui');
    expect(family!.style.fontWeight).toBe('');
    expect(weight!.style.fontWeight).toBe('600');
    expect(weight!.style.fontFamily).toBe('');
  });

  it('outros tipos, ou tipografia sem nenhum campo que converta, ficam sem amostra', () => {
    dom.render(
      <TypographyTokens tokens={[token('n', 'number', 1), token('t', 'typography', { fontWeight: 'heavyish' })]} modes={['light', 'dark']} />,
    );
    expect(samples()).toHaveLength(0);
  });
});
