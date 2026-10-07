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
    expect(diagnostics.map((d) => d.message)).toEqual([
      'tabela não pode ficar direto dentro de <Callout> (como no editor do CMS) — use um <DosDonts> ou tire a tabela do callout.',
    ]);
  });

  it('tabela mais funda (numa lista do callout) é aceita, como no CMS', () => {
    const { diagnostics } = mdx('<Callout>\n\n- item\n\n  | a |\n  | - |\n  | b |\n\n</Callout>');
    expect(diagnostics).toEqual([]);
  });
});

describe('<ComponentEmbed>', () => {
  it('par componente/variante', () => {
    const { doc, diagnostics } = mdx('<ComponentEmbed component="Button" variant="primary" />');
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([{ type: 'componentEmbed', attrs: { componentName: 'Button', variantId: 'primary' } }]);
  });
});

describe('<TokenTable> (SYS-137)', () => {
  it('grupo; sem grupo são todos os tokens', () => {
    const { doc, diagnostics } = mdx('<TokenTable group="color.brand" />\n\n<TokenTable />\n\n<TokenTable group="" />');
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([
      { type: 'tokenTable', attrs: { group: 'color.brand' } },
      { type: 'tokenTable', attrs: { group: '' } },
      { type: 'tokenTable', attrs: { group: '' } },
    ]);
  });

  it('dentro de <DosDonts> pode; dentro de <Callout> não, como no CMS', () => {
    expect(mdx('<DosDonts variant="do">\n  Veja.\n\n  <TokenTable group="space" />\n</DosDonts>').diagnostics).toEqual([]);
    expect(mdx('<Callout>\n  Veja.\n\n  <TokenTable group="space" />\n</Callout>').diagnostics.map((d) => d.message)).toEqual([
      '<TokenTable> não pode ficar dentro de <Callout> (como no editor do CMS) — tire a tabela de tokens do callout.',
    ]);
  });

  it('com conteúdo ou prop desconhecida é erro', () => {
    expect(mdx('<TokenTable group="x">texto</TokenTable>').diagnostics.map((d) => d.message)).toEqual([
      '<TokenTable> não tem conteúdo — use a forma auto-fechada: <TokenTable group="…" />.',
    ]);
    expect(mdx('<TokenTable grup="x" />').diagnostics.map((d) => d.message)).toEqual([
      '<TokenTable>: a prop "grup" não existe (quis dizer "group"?) — aceitas: "group".',
    ]);
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
    expect(references.images).toEqual([{ src: './x.png', line: 1, column: 26 }]);
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
    ['<ComponentEmbed component="" variant="p" />', 'a prop "component" não pode ser vazia'],
    ['<Callout variant="info" variant="tip">x</Callout>', 'a prop "variant" aparece mais de uma vez'],
    ['<DosDonts variant="do" coverImage="./x.png" coverAlt="">a</DosDonts>', 'a prop "coverAlt" não pode ser vazia'],
    ['{/* comentário */}', 'nem comentários'],
    ['<Callout>texto\nmais\n\n- lista\n</Callout>', 'quebre a linha logo depois da tag de abertura'],
    ['<DosDonts title="x">a</DosDonts>', 'a prop "variant" é obrigatória'],
    ['<DosDonts variant="do" coverImage="./x.png">a</DosDonts>', '"coverImage" e "coverAlt" andam juntas'],
    ['<DosDonts variant="do" coverComponent="B">a</DosDonts>', '"coverComponent" e "coverVariant" andam juntas'],
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

  it('registra os pares componente/variante do embed e do cover, com posição', () => {
    const { references, diagnostics } = mdx(
      '<ComponentEmbed component="Button" variant="primary" />\n\n<DosDonts variant="do" coverComponent="Card" coverVariant="default">\n  Ok.\n</DosDonts>',
    );
    expect(diagnostics).toEqual([]);
    expect(references.components).toEqual([
      { componentName: 'Button', variantId: 'primary', line: 1, column: 1 },
      { componentName: 'Card', variantId: 'default', line: 3, column: 24 },
    ]);
  });

  it('cover de imagem de um bloco recusado não vira referência', () => {
    const { references, diagnostics } = mdx('<DosDonts variant="do" coverImage="./a.png" coverAlt="a"></DosDonts>');
    expect(diagnostics.map((d) => d.message)).toEqual(['<DosDonts> vazio — escreva a explicação entre as tags.']);
    expect(references.images).toEqual([]);
  });

  it('title vazio é aceito (é opcional)', () => {
    expect(mdx('<DosDonts variant="do" title="">a</DosDonts>').diagnostics).toEqual([]);
  });

  it('problemas dentro de um componente com prop inválida também aparecem', () => {
    const { diagnostics } = mdx('<Callout variant="x">\n\n#### fundo\n\n</Callout>');
    expect(diagnostics).toHaveLength(2);
  });
});
