import { describe, expect, it } from 'vitest';
import type { Token, TokenSet, TokenType, TokenValue } from '@systembook/schema';
import { tokenModeSelector, tokensToCss } from './variables.js';

function token(path: string, type: TokenType, byMode: Record<string, TokenValue>): Token {
  return {
    path,
    type,
    byMode: Object.fromEntries(Object.entries(byMode).map(([mode, value]) => [mode, { value, resolvedValue: value }])),
  };
}

describe('tokensToCss', () => {
  it('um bloco por modo; o primeiro também vale em :root', () => {
    const set: TokenSet = {
      modes: ['light', 'dark'],
      tokens: [
        token('color.bg', 'color', { light: '#ffffff', dark: '#0b0b0c' }),
        token('color.brandPrimary.500', 'color', { light: { colorSpace: 'srgb', components: [0, 0.5, 1] }, dark: '#3399ff' }),
        token('space.2', 'dimension', { light: 8, dark: 8 }),
        token('motion.fast', 'duration', { light: 150, dark: 150 }),
        token('accent.$root', 'color', { light: 'rebeccapurple', dark: 'plum' }),
      ],
    };
    expect(tokensToCss(set)).toMatchInlineSnapshot(`
      ":root, [data-mode="light"] {
        --color-bg: #ffffff;
        --color-brand-primary-500: color(srgb 0 0.5 1);
        --space-2: 8px;
        --motion-fast: 150ms;
        --accent: rebeccapurple;
      }

      [data-mode="dark"] {
        --color-bg: #0b0b0c;
        --color-brand-primary-500: #3399ff;
        --space-2: 8px;
        --motion-fast: 150ms;
        --accent: plum;
      }"
    `);
  });

  it('compostos viram CSS válido: tipografia como `font`, sombra em camadas, borda, transição e gradiente', () => {
    const set: TokenSet = {
      modes: ['default'],
      tokens: [
        token('font.body', 'typography', {
          default: { fontFamily: ['Inter Variable', 'sans-serif'], fontSize: 16, fontWeight: 'Regular', letterSpacing: 0, lineHeight: 1.5 },
        }),
        token('shadow.raised', 'shadow', {
          default: [
            { color: '#0000001a', offsetX: 0, offsetY: 1, blur: 2, spread: 0 },
            { color: '#00000026', offsetX: 0, offsetY: 4, blur: 12, spread: -2, inset: true },
          ],
        }),
        token('border.subtle', 'border', { default: { color: '#e5e5e5', width: 1, style: 'solid' } }),
        token('motion.enter', 'transition', { default: { duration: 200, delay: 0, timingFunction: [0.2, 0, 0, 1] } }),
        token('gradient.brand', 'gradient', {
          default: [
            { color: '#0a84ff', position: 0 },
            { color: '#5e5ce6', position: 1 },
          ],
        }),
      ],
    };
    expect(tokensToCss(set)).toMatchInlineSnapshot(`
      ":root, [data-mode="default"] {
        --font-body: 400 16px/1.5 "Inter Variable", sans-serif;
        --shadow-raised: 0 1px 2px 0 #0000001a, inset 0 4px 12px -2px #00000026;
        --border-subtle: 1px solid #e5e5e5;
        --motion-enter: 200ms cubic-bezier(0.2, 0, 0, 1) 0;
        --gradient-brand: linear-gradient(90deg, #0a84ff 0%, #5e5ce6 100%);
      }"
    `);
  });

  it('pula o valor que não converte ou que fecharia a declaração', () => {
    const set: TokenSet = {
      modes: ['default'],
      tokens: [
        token('a', 'color', { default: { colorSpace: 'nope', components: [1, 1, 1] } }),
        token('b', 'color', { default: 'red; } body { display: none' }),
        token('c', 'dimension', { default: '4px /* x */' }),
        token('d', 'color', { default: '#000' }),
      ],
    };
    expect(tokensToCss(set)).toBe(':root, [data-mode="default"] {\n  --d: #000;\n}');
  });

  it('escapa o nome do modo no seletor', () => {
    expect(tokenModeSelector('a"b\\c\nd')).toBe('[data-mode="a\\"b\\\\c\\a d"]');
  });
});
