// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenValue } from '@systembook/schema';
import { loadTokenSet } from '@systembook/content/tokens';
import { setupDom } from '../../../test/dom.js';
import { TypographySpecimens } from './TypographySpecimens.js';

const dom = setupDom();

const token = (path: string, light: TokenValue, dark: TokenValue = light): Token => ({
  path,
  type: 'typography',
  byMode: { light: { value: light, resolvedValue: light }, dark: { value: dark, resolvedValue: dark } },
});

const BODY = { fontFamily: ['Inter', 'sans-serif'], fontSize: { value: 16, unit: 'px' }, fontWeight: 'bold', letterSpacing: '-0.5px', lineHeight: 1.5 };

const specimens = () => [...dom.container().querySelectorAll<HTMLElement>('[role=listitem]')];
const samples = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.sb-type-specimen-sample')];
const props = (el: HTMLElement) =>
  [...el.querySelectorAll('.sb-type-specimen-props > div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]);
const styleOf = (el: HTMLElement) => [el.style.fontFamily, el.style.fontSize, el.style.fontWeight, el.style.letterSpacing, el.style.lineHeight];

describe('TypographySpecimens', () => {
  it('um specimen por token: amostra com o estilo inteiro, propriedades rotuladas, copiar', () => {
    dom.render(<TypographySpecimens tokens={[token('type.body', BODY)]} modes={['light', 'dark']} label="type" />);
    expect(dom.container().querySelector('table')).toBeNull();
    expect(dom.container().querySelector('[role=list]')!.getAttribute('aria-label')).toBe('type');
    const [body] = specimens();
    expect(body!.querySelector('.sb-token-name')!.textContent).toBe('type.body');
    // Igual nos dois modos: uma amostra só, sem rótulo de modo.
    expect(samples(body!)).toHaveLength(1);
    expect(body!.querySelector('.sb-type-specimen-mode-name')).toBeNull();
    expect(samples(body!)[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(styleOf(samples(body!)[0]!)).toEqual(['Inter, sans-serif', '16px', '700', '-0.5px', '1.5']);
    expect(props(body!)).toEqual([
      ['Family', 'Inter, sans-serif'],
      ['Size', '16px'],
      ['Weight', '700'],
      ['Letter spacing', '-0.5px'],
      ['Line height', '1.5'],
    ]);
    expect(body!.querySelectorAll('.sb-token-copy-button')).toHaveLength(3);
  });

  it('tipografia que muda com o modo: uma amostra rotulada por modo', () => {
    dom.render(
      <TypographySpecimens tokens={[token('type.body', BODY, { ...BODY, fontSize: 18, lineHeight: '28px' })]} modes={['light', 'dark']} />,
    );
    const [body] = specimens();
    expect([...body!.querySelectorAll('.sb-type-specimen-mode-name')].map((m) => m.textContent)).toEqual(['light', 'dark']);
    expect(samples(body!).map((s) => [s.style.fontSize, s.style.lineHeight])).toEqual([
      ['16px', '1.5'],
      ['18px', '28px'],
    ]);
  });

  it('campo faltando é "—" e o que não converte sai cru', () => {
    dom.render(<TypographySpecimens tokens={[token('t', { fontFamily: 'Inter', fontSize: '16px', fontWeight: 'heavyish' })]} modes={['light']} />);
    expect(props(specimens()[0]!)).toEqual([
      ['Family', 'Inter'],
      ['Size', '16px'],
      ['Weight', '"heavyish"'],
      ['Letter spacing', '—'],
      ['Line height', '—'],
    ]);
  });

  it('aliases nos campos resolvidos, alias do token inteiro mostrado', () => {
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
            title: { $value: '{type.heading}' },
          },
        }),
      },
    ]);
    dom.render(<TypographySpecimens tokens={set.tokens.filter((t) => t.type === 'typography')} modes={set.modes} />);
    const [heading, title] = specimens();
    expect(styleOf(samples(heading!)[0]!)).toEqual(['Inter, sans-serif', '64px', '700', '0px', '1.2']);
    expect(title!.querySelector('.sb-token-alias')!.textContent).toBe('→ type.heading');
  });
});
