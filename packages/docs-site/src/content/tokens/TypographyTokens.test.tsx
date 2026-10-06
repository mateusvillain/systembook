// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenType, TokenValue } from '@systembook/schema';
import { loadTokenSet } from '@systembook/content/tokens';
import { setupDom } from '../../../test/dom.js';
import { TypographyTokens } from './TypographyTokens.js';

const dom = setupDom();

const token = (path: string, type: TokenType, light: TokenValue, dark: TokenValue = light): Token => ({
  path,
  type,
  byMode: { light: { value: light, resolvedValue: light }, dark: { value: dark, resolvedValue: dark } },
});

const samples = () => [...dom.container().querySelectorAll<HTMLElement>('.sb-token-type-sample')];
const styleOf = (el: HTMLElement) => [el.style.fontFamily, el.style.fontSize, el.style.fontWeight, el.style.letterSpacing, el.style.lineHeight];

describe('TypographyTokens', () => {
  it('typography aplica as propriedades na amostra, em cada modo', () => {
    dom.render(
      <TypographyTokens
        tokens={[
          token(
            'type.body',
            'typography',
            { fontFamily: ['Inter', 'sans-serif'], fontSize: { value: 16, unit: 'px' }, fontWeight: 'bold', letterSpacing: '-0.5px', lineHeight: 1.5 },
            { fontFamily: 'Inter', fontSize: 18, fontWeight: 400, letterSpacing: 0, lineHeight: '28px' },
          ),
        ]}
        modes={['light', 'dark']}
      />,
    );
    const [light, dark] = samples();
    expect(light!.getAttribute('aria-hidden')).toBe('true');
    expect(styleOf(light!)).toEqual(['Inter, sans-serif', '16px', '700', '-0.5px', '1.5']);
    expect([dark!.style.fontSize, dark!.style.lineHeight]).toEqual(['18px', '28px']);
    // O valor escrito continua lá, uma propriedade por linha, e os botões de copiar.
    expect(dom.container().querySelector('td.sb-token-cell')!.querySelectorAll('.sb-token-value')).toHaveLength(5);
    expect(dom.container().querySelectorAll('.sb-token-copy-button')).toHaveLength(3);
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

  it('tipografia com aliases nos campos, num modo só (default)', () => {
    const { set } = loadTokenSet([
      {
        file: 't.json',
        content: JSON.stringify({
          font: { family: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] }, bold: { $type: 'fontWeight', $value: 'bold' } },
          type: {
            $type: 'typography',
            heading: {
              $value: { fontFamily: '{font.family}', fontSize: '64px', fontWeight: '{font.bold}', letterSpacing: '0px', lineHeight: 1.2 },
            },
          },
        }),
      },
    ]);
    const heading = set.tokens.filter((t) => t.path === 'type.heading');
    dom.render(<TypographyTokens tokens={heading} modes={set.modes} />);
    expect([...dom.container().querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Token', 'Value', 'Details']);
    expect(styleOf(samples()[0]!)).toEqual(['Inter, sans-serif', '64px', '700', '0px', '1.2']);
  });

  it('outros tipos, ou tipografia sem nenhum campo que converta, ficam sem amostra', () => {
    dom.render(
      <TypographyTokens tokens={[token('n', 'number', 1), token('t', 'typography', { fontWeight: 'heavyish' })]} modes={['light', 'dark']} />,
    );
    expect(samples()).toHaveLength(0);
  });
});
