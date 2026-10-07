import { describe, expect, it } from 'vitest';
import type { Token } from '@systembook/schema';
import { tokenGroups, tokenSections, tokensInGroup } from './groups.js';

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

describe('tokenGroups', () => {
  it('todo caminho acima de um token, na ordem do primeiro token', () => {
    expect(tokenGroups(TOKENS)).toEqual(['color', 'color.brand', 'space']);
    expect(tokenGroups(['accent.$root', 'accent.muted', 'solo'].map(token))).toEqual(['accent']);
    expect(tokenGroups([])).toEqual([]);
  });
});

describe('tokenSections', () => {
  const sections = (list: string[]) =>
    tokenSections(list.map(token)).map(({ group, tokens }) => [group, tokens.map((t) => t.path)]);

  it('sem o namespace comum, um nível abaixo dele; os do próprio namespace numa seção', () => {
    expect(sections(['acme.primary', 'acme.palette.indigo.300', 'acme.palette.slate.50', 'acme.space.1', 'acme.surface'])).toEqual([
      ['acme', ['acme.primary', 'acme.surface']],
      ['acme.palette', ['acme.palette.indigo.300', 'acme.palette.slate.50']],
      ['acme.space', ['acme.space.1']],
    ]);
  });

  it('sem namespace: o primeiro segmento; tokens na raiz ficam na seção vazia', () => {
    expect(sections(['color.brand', 'space.1', 'color.brand.hover', 'solo'])).toEqual([
      ['color', ['color.brand', 'color.brand.hover']],
      ['space', ['space.1']],
      ['', ['solo']],
    ]);
  });

  it('um grupo só: ele mesmo; nenhum token, nenhuma seção', () => {
    expect(sections(['acme.color.a', 'acme.color.b'])).toEqual([['acme.color', ['acme.color.a', 'acme.color.b']]]);
    expect(sections([])).toEqual([]);
  });
});
