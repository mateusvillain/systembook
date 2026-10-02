import { describe, expect, it } from 'vitest';
import { parseDocument } from './index.js';

const mdx = (body: string) => parseDocument(body, { file: 'c.mdx', format: 'mdx', kind: 'landing' });
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('<Callout>', () => {
  it('variante e conteúdo em blocos', () => {
    const { doc, diagnostics } = mdx('<Callout variant="warning">\n  Cuidado.\n\n  - um\n</Callout>');
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([
      {
        type: 'callout',
        attrs: { variant: 'warning' },
        content: [
          p('Cuidado.'),
          { type: 'bulletList', content: [{ type: 'listItem', content: [p('um')] }] },
        ],
      },
    ]);
  });

  it('numa linha só, e sem variant (padrão info)', () => {
    const { doc, diagnostics } = mdx('<Callout>Linha **única**</Callout>');
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([
      {
        type: 'callout',
        attrs: { variant: 'info' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Linha ' }, { type: 'text', text: 'única', marks: [{ type: 'bold' }] }] }],
      },
    ]);
  });

  it('aninha callout, dos-donts, embed e imagem', () => {
    const { doc, diagnostics } = mdx(
      '<Callout>\n  Fora.\n\n  <Callout variant="tip">Dentro.</Callout>\n\n  <ComponentEmbed component="Button" variant="primary" />\n\n  ![a](./a.png)\n</Callout>',
    );
    expect(diagnostics).toEqual([]);
    expect(doc.content?.[0]?.content?.map((n) => n.type)).toEqual(['paragraph', 'callout', 'componentEmbed', 'image']);
  });

  it('tabela direto dentro é erro (como no CMS)', () => {
    const { diagnostics } = mdx('<Callout>\n\n| a |\n| - |\n| b |\n\n</Callout>');
    expect(diagnostics.map((d) => d.message)).toEqual(['tabela dentro de <Callout> não é suportada (como no editor do CMS).']);
  });
});

describe('<ComponentEmbed>', () => {
  it('par componente/variante', () => {
    const { doc, diagnostics } = mdx('<ComponentEmbed component="Button" variant="primary" />');
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([{ type: 'componentEmbed', attrs: { componentName: 'Button', variantId: 'primary' } }]);
  });
});

describe('<DosDonts>', () => {
  it('com cover de componente e título', () => {
    const { doc, diagnostics } = mdx(
      '<DosDonts variant="do" title="Use verbos" coverComponent="Button" coverVariant="primary">\n  "Salvar" diz o que acontece.\n</DosDonts>',
    );
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([
      {
        type: 'dosDonts',
        attrs: {
          variant: 'do',
          titulo: 'Use verbos',
          cover: { kind: 'component-embed', componentName: 'Button', variantId: 'primary' },
        },
        content: [p('"Salvar" diz o que acontece.')],
      },
    ]);
  });

  it('com cover de imagem (vira referência) e sem título', () => {
    const { doc, references, diagnostics } = mdx(
      '<DosDonts variant="dont" coverImage="./x.png" coverAlt="Dois primários">\n  Não.\n</DosDonts>',
    );
    expect(diagnostics).toEqual([]);
    expect(doc.content?.[0]?.attrs).toEqual({
      variant: 'dont',
      titulo: '',
      cover: { kind: 'image', src: './x.png', alt: 'Dois primários' },
    });
    expect(references.images).toEqual([{ src: './x.png', line: 1, column: 1 }]);
  });

  it('sem cover, aceita tabela no conteúdo', () => {
    const { doc, diagnostics } = mdx('<DosDonts variant="do">\n\n| a |\n| - |\n| b |\n\n</DosDonts>');
    expect(diagnostics).toEqual([]);
    expect(doc.content?.[0]).toMatchObject({ attrs: { cover: null }, content: [{ type: 'table' }] });
  });
});

describe('props e uso inválidos viram erro com posição', () => {
  it.each([
    ['<Callout variant="danger">x</Callout>', '"danger" não é um valor de "variant"'],
    ['<Callout variant={"info"}>x</Callout>', 'precisa ser texto entre aspas'],
    ['<Callout {...props}>x</Callout>', 'spread de props'],
    ['<Callout variant>x</Callout>', 'precisa de um valor entre aspas'],
    ['<Callout tone="info">x</Callout>', 'prop "tone" não existe'],
    ['<Callout variant="info"></Callout>', '<Callout> vazio'],
    ['<ComponentEmbed component="Button" />', 'a prop "variant" é obrigatória'],
    ['<ComponentEmbed component="Button" variant="p">texto</ComponentEmbed>', 'auto-fechada'],
    ['<ComponentEmbed componet="Button" variant="p" />', '(quis dizer "component"?)'],
    ['<DosDonts title="x">a</DosDonts>', 'a prop "variant" é obrigatória'],
    ['<DosDonts variant="do" coverImage="./x.png">a</DosDonts>', '`coverImage` e `coverAlt` andam juntos'],
    ['<DosDonts variant="do" coverComponent="B">a</DosDonts>', '`coverComponent` e `coverVariant` andam juntos'],
    ['<DosDonts variant="do" coverImage="a" coverAlt="b" coverComponent="c" coverVariant="d">a</DosDonts>', 'imagem ou um componente'],
    ['<DosDonts variant="do" />', '<DosDonts> vazio'],
    ['Texto <Callout>x</Callout> no meio', '<Callout> é um bloco'],
  ])('%s', (body, expected) => {
    const { diagnostics } = mdx(body);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.map((d) => d.message).join('\n')).toContain(expected);
  });

  it('o erro de prop aponta a própria prop', () => {
    const { diagnostics } = mdx('ok\n\n<Callout\n  variant="danger">x</Callout>');
    expect(diagnostics.map((d) => [d.line, d.column])).toEqual([[4, 3]]);
  });

  it('problemas dentro de um componente com prop inválida também aparecem', () => {
    const { diagnostics } = mdx('<Callout variant="x">\n\n#### fundo\n\n</Callout>');
    expect(diagnostics).toHaveLength(2);
  });
});
