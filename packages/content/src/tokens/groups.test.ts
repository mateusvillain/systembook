import { describe, expect, it } from 'vitest';
import type { Token } from '@systembook/schema';
import { tokensInGroup } from './groups.js';

const token = (path: string): Token => ({ path, type: 'color', byMode: { default: { value: '#000', resolvedValue: '#000' } } });
const TOKENS = ['color.brand', 'color.brand.hover', 'color.brandish', 'color.neutral', 'space.1'].map(token);
const paths = (group: string) => tokensInGroup(TOKENS, group).map((t) => t.path);

describe('tokensInGroup', () => {
  it('o grupo e o que está abaixo, por segmento inteiro', () => {
    expect(paths('color.brand')).toEqual(['color.brand', 'color.brand.hover']);
    expect(paths('color')).toEqual(['color.brand', 'color.brand.hover', 'color.brandish', 'color.neutral']);
  });

  it('grupo vazio são todos; grupo inexistente, nenhum', () => {
    expect(paths('')).toEqual(TOKENS.map((t) => t.path));
    expect(paths('colour')).toEqual([]);
    expect(paths('color.')).toEqual([]);
  });
});
