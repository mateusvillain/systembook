import { describe, expect, it } from 'vitest';
import { parseInlineMarkdown, stripInlineMarkdown } from './inline.js';

describe('parseInlineMarkdown', () => {
  it('negrito, itálico e código', () => {
    expect(parseInlineMarkdown("**Let's UI** é `css` e *leve*")).toEqual([
      { type: 'bold', children: [{ type: 'text', text: "Let's UI" }] },
      { type: 'text', text: ' é ' },
      { type: 'code', text: 'css' },
      { type: 'text', text: ' e ' },
      { type: 'italic', children: [{ type: 'text', text: 'leve' }] },
    ]);
  });

  it('link, com marks dentro do texto', () => {
    expect(parseInlineMarkdown('veja [o **guia**](/guia)')).toEqual([
      { type: 'text', text: 'veja ' },
      { type: 'link', href: '/guia', children: [{ type: 'text', text: 'o ' }, { type: 'bold', children: [{ type: 'text', text: 'guia' }] }] },
    ]);
  });

  it('não reinterpreta o conteúdo de código e não trata `_` como itálico', () => {
    expect(stripInlineMarkdown('use `**x**` com snake_case_name')).toBe('use **x** com snake_case_name');
  });

  it('href perigoso fica como texto', () => {
    expect(parseInlineMarkdown('[x](javascript:alert(1))')).toEqual([{ type: 'text', text: '[x](javascript:alert(1))' }]);
  });

  it('marcador sem par fica literal', () => {
    expect(stripInlineMarkdown('2 * 3 e **aberto')).toBe('2 * 3 e **aberto');
  });
});

describe('stripInlineMarkdown', () => {
  it('remove os marcadores', () => {
    expect(stripInlineMarkdown('**Let\'s UI** é [aberto](https://x.dev)')).toBe("Let's UI é aberto");
  });
});
