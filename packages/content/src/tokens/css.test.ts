import { describe, expect, it } from 'vitest';
import type { TokenType, TokenValue } from '@systembook/schema';
import { toCssLines, toCssValue, typographyProperties } from './css.js';

describe('toCssValue', () => {
  it.each<[TokenType, TokenValue, string]>([
    ['color', '#0a84ff', '#0a84ff'],
    ['color', 'rgb(0 0 0 / 50%)', 'rgb(0 0 0 / 50%)'],
    ['color', { colorSpace: 'srgb', components: [0.04, 0.52, 1] }, 'color(srgb 0.04 0.52 1)'],
    ['color', { colorSpace: 'display-p3', components: [1, 0, 0], alpha: 0.5 }, 'color(display-p3 1 0 0 / 0.5)'],
    ['color', { colorSpace: 'oklch', components: [0.6, 0.2, 'none'] }, 'oklch(0.6 0.2 none)'],
    ['color', { colorSpace: 'hsl', components: [210, 50, 40] }, 'hsl(210 50% 40%)'],
    ['color', { colorSpace: 'srgb', components: [1, 1, 1], alpha: 1 }, 'color(srgb 1 1 1)'],
    ['dimension', '1.5rem', '1.5rem'],
    ['dimension', 16, '16px'],
    ['dimension', 0, '0'],
    ['dimension', { value: 0.1 + 0.2, unit: 'rem' }, '0.3rem'],
    ['fontFamily', 'Inter', 'Inter'],
    ['fontFamily', ['Inter Variable', 'system-ui', 'sans-serif'], '"Inter Variable", system-ui, sans-serif'],
    ['fontWeight', 600, '600'],
    ['fontWeight', '700', '700'],
    ['fontWeight', 'Semi Bold', '600'],
    ['duration', '200ms', '200ms'],
    ['duration', 150, '150ms'],
    ['duration', { value: 0.2, unit: 's' }, '0.2s'],
    ['cubicBezier', [0.2, 0, 0, 1], 'cubic-bezier(0.2, 0, 0, 1)'],
    ['cubicBezier', 'ease-in-out', 'ease-in-out'],
    ['number', 1.5, '1.5'],
    ['strokeStyle', 'Dashed', 'dashed'],
    ['strokeStyle', { dashArray: ['2px'], lineCap: 'round' }, 'dashed'],
    ['border', { color: '#000', width: 1, style: 'solid' }, '1px solid #000'],
    ['transition', { duration: '200ms', delay: 0, timingFunction: 'ease' }, '200ms ease 0'],
    ['shadow', { color: '#0003', offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px' }, '0px 2px 8px 0px #0003'],
    [
      'shadow',
      [
        { color: '#000', offsetX: 0, offsetY: 1, blur: 2, spread: 0, inset: true },
        { color: '#111', offsetX: 0, offsetY: 4, blur: 8, spread: 0 },
      ],
      'inset 0 1px 2px 0 #000, 0 4px 8px 0 #111',
    ],
    [
      'gradient',
      [
        { color: '#000', position: 0 },
        { color: '#fff', position: '100%' },
      ],
      'linear-gradient(90deg, #000 0%, #fff 100%)',
    ],
    [
      'typography',
      { fontFamily: ['Inter', 'sans-serif'], fontSize: 16, fontWeight: 'bold', letterSpacing: 0, lineHeight: 1.5 },
      '700 16px/1.5 Inter, sans-serif',
    ],
  ])('%s %j → %s', (type, value, expected) => {
    expect(toCssValue(type, value)).toBe(expected);
  });

  it('o que não reconhece é null', () => {
    expect(toCssValue('color', { colorSpace: 'nope', components: [1, 1, 1] })).toBeNull();
    expect(toCssValue('color', { colorSpace: 'nope', components: [1, 1, 1], hex: '#fff' })).toBe('#fff');
    expect(toCssValue('border', { color: '#000', width: '1px' })).toBeNull();
    expect(toCssValue('number', 'x')).toBeNull();
  });
});

describe('toCssLines', () => {
  it('tipografia: uma propriedade CSS por linha, inclusive letter-spacing', () => {
    expect(
      toCssLines('typography', { fontFamily: ['Inter', 'sans-serif'], fontSize: '16px', fontWeight: 'bold', letterSpacing: '-0.5px', lineHeight: 1.5 }),
    ).toEqual(['font-family: Inter, sans-serif', 'font-size: 16px', 'font-weight: 700', 'letter-spacing: -0.5px', 'line-height: 1.5']);
    expect(typographyProperties({ fontSize: 14, lineHeight: '20px' })).toEqual({ 'font-size': '14px', 'line-height': '20px' });
  });

  it('sombra em camadas, uma por linha; uma camada só cabe numa linha', () => {
    const layer = { color: '#000', offsetX: 0, offsetY: 1, blur: 2, spread: 0 };
    expect(toCssLines('shadow', [layer, { ...layer, inset: true }])).toEqual(['0 1px 2px 0 #000', 'inset 0 1px 2px 0 #000']);
    expect(toCssLines('shadow', [layer])).toBeNull();
    expect(toCssLines('shadow', layer)).toBeNull();
  });

  it('strokeStyle com dashArray mostra o padrão, que o CSS não expressa', () => {
    expect(toCssLines('strokeStyle', { dashArray: ['2px', 4], lineCap: 'round' })).toEqual(['dashArray: 2px 4px', 'lineCap: round']);
    expect(toCssLines('strokeStyle', 'solid')).toBeNull();
  });

  it('o resto cabe numa linha', () => {
    expect(toCssLines('color', '#fff')).toBeNull();
    expect(toCssLines('border', { color: '#000', width: '1px', style: 'solid' })).toBeNull();
  });
});
