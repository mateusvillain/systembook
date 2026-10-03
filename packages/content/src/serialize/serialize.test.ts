import { describe, expect, it } from 'vitest';
import { tiptapDocToBlocks, type BlockData, type TiptapDoc, type TiptapNode } from '../blocks.js';
import { parseDocument } from '../parse/index.js';
import { serializeBlocks, serializeDocument } from './index.js';

const parse = (source: string) => parseDocument(source, { file: 'x.mdx', format: 'mdx', kind: 'landing' });

/** Serializa, lê de volta e exige o mesmo doc, sem diagnóstico nem aviso. */
function expectRoundTrip(doc: TiptapDoc) {
  const { source, warnings } = serializeDocument(doc);
  const back = parse(source);
  expect(back.diagnostics, source).toEqual([]);
  expect(warnings, source).toEqual([]);
  expect(back.doc, source).toEqual(doc);
  return source;
}

const text = (t: string, marks?: unknown[]): TiptapNode =>
  marks ? { type: 'text', text: t, marks } : { type: 'text', text: t };
const p = (...content: TiptapNode[]): TiptapNode => ({ type: 'paragraph', content });
const link = (href: string, title: string | null = null) => ({
  type: 'link',
  attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title },
});
const bold = { type: 'bold' };
const italic = { type: 'italic' };
const underline = { type: 'underline' };
const code = { type: 'code' };
const cell = (type: 'tableHeader' | 'tableCell', content: TiptapNode[], align: string | null = null): TiptapNode => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: null, align },
  content: [content.length ? p(...content) : { type: 'paragraph' }],
});
const item = (...content: TiptapNode[]): TiptapNode => ({ type: 'listItem', content });

/** Um bloco de cada tipo, na forma canônica que o editor do CMS grava. */
const ALL_BLOCKS: (BlockData & { ordem: number })[] = [
  { type: 'heading', content: { level: 1, body: [text('Botão')] } },
  { type: 'heading', content: { level: 2, body: [text('Uso '), text('real', [italic])] } },
  { type: 'heading', content: { level: 3, body: [text('Detalhes')] } },
  {
    type: 'paragraph',
    content: {
      body: [
        text('Use o '),
        text('botão ', [bold]),
        text('primário', [bold, italic]),
        text(' para a '),
        text('ação ', [italic]),
        text('principal', [italic, underline]),
        text(' — '),
        text('ver ', [link('https://x.dev', 'Tokens')]),
        text('tokens', [link('https://x.dev', 'Tokens'), italic]),
        text(', '),
        text('--primary', [code]),
        text(' e '),
        text('Button', [link('./button.mdx'), code]),
        text('.'),
      ],
    },
  },
  {
    type: 'list',
    content: {
      ordered: true,
      body: {
        type: 'orderedList',
        attrs: { start: 3, type: null },
        content: [
          item(
            p(text('Primário')),
            { type: 'bulletList', content: [item(p(text('com ícone'))), item(p(text('sem ícone')))] },
            { type: 'codeBlock', attrs: { language: 'typescript' }, content: [text('<Button variant="primary" />')] },
          ),
          item(p(text('Secundário', [bold]))),
        ],
      },
    },
  },
  { type: 'list', content: { ordered: false, body: { type: 'bulletList', content: [item(p(text('solto')))] } } },
  { type: 'code', content: { language: null, code: 'texto puro\n\n  indentado' } },
  { type: 'code', content: { language: 'bash', code: '' } },
  { type: 'image', content: { src: './img/botao.png', alt: 'Botão primário', caption: 'Estado padrão' } },
  { type: 'image', content: { src: 'https://x.dev/a b.png', alt: '', caption: null } },
  {
    type: 'table',
    content: {
      body: {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', [text('Token')]), cell('tableHeader', [text('Uso')], 'right')] },
          {
            type: 'tableRow',
            content: [cell('tableCell', [text('--primary', [code])]), cell('tableCell', [text('Ação', [bold]), text(' | principal')], 'right')],
          },
          { type: 'tableRow', content: [cell('tableCell', [text('--muted', [code])]), cell('tableCell', [], 'right')] },
        ],
      },
    },
  },
  {
    type: 'callout',
    content: {
      variant: 'warning',
      body: [
        p(text('Evite '), text('duas', [bold]), text(' ações primárias.')),
        { type: 'callout', attrs: { variant: 'info' }, content: [p(text('Aninhado.'))] },
        { type: 'componentEmbed', attrs: { componentName: 'Button', variantId: 'primary' } },
        { type: 'image', attrs: { src: './b.png', alt: 'Botão', caption: 'Legenda' } },
        { type: 'bulletList', content: [item(p(text('item')))] },
      ],
    },
  },
  { type: 'callout', content: { variant: 'tip', body: [p(text('Dica.'))] } },
  { type: 'component-embed', content: { componentName: 'Input', variantId: 'error' } },
  {
    type: 'dos-donts',
    content: {
      variant: 'do',
      titulo: 'Use verbos',
      cover: { kind: 'component-embed', componentName: 'Button', variantId: 'primary' },
      descricao: [
        p(text('"Salvar" diz o que acontece.')),
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [cell('tableHeader', [text('Rótulo')]), cell('tableHeader', [text('Bom?')], 'center')] },
            { type: 'tableRow', content: [cell('tableCell', [text('Salvar')]), cell('tableCell', [text('sim')], 'center')] },
          ],
        },
      ],
    },
  },
  {
    type: 'dos-donts',
    content: {
      variant: 'dont',
      titulo: 'Diga "não" & siga',
      cover: { kind: 'image', src: './x.png', alt: 'Dois primários' },
      descricao: [p(text('Não empilhe.'))],
    },
  },
  { type: 'dos-donts', content: { variant: 'do', titulo: '', cover: undefined, descricao: [p(text('Sem cover nem título.'))] } },
].map((b, ordem) => ({ ...b, ordem }) as BlockData & { ordem: number });

describe('round-trip Block[] → MDX → Block[]', () => {
  it('todos os tipos de bloco voltam idênticos', () => {
    const { source, warnings } = serializeBlocks(ALL_BLOCKS);
    expect(warnings).toEqual([]);
    const back = parse(source);
    expect(back.diagnostics, source).toEqual([]);
    expect(tiptapDocToBlocks(back.doc)).toEqual(ALL_BLOCKS);
  });

  it('a saída é estável: serializar o que foi lido dá o mesmo arquivo', () => {
    const { source } = serializeBlocks(ALL_BLOCKS);
    expect(serializeDocument(parse(source).doc).source).toBe(source);
  });

  it('a saída é legível', () => {
    expect(serializeBlocks(ALL_BLOCKS.slice(3, 6)).source).toMatchInlineSnapshot(`
      "Use o **botão *primário*** para a *ação <u>principal</u>* — [ver *tokens*](https://x.dev "Tokens"), \`--primary\` e [\`Button\`](./button.mdx).

      3. Primário
         - com ícone
         - sem ícone

         \`\`\`typescript
         <Button variant="primary" />
         \`\`\`
      4. **Secundário**

      - solto
      "
    `);
  });
});

describe('MDX → Block[] → MDX', () => {
  it('o conteúdo lido de arquivo volta igual', () => {
    const source = `# Título

Texto com **negrito**, *itálico*, <u>sublinhado</u>, \`código\` e [link](https://x.dev).

- a
  - b
- c

1. um
2. dois

\`\`\`ts
const a = 1;
\`\`\`

| A | B |
| :--- | :---: |
| 1 | 2 |

<Callout variant="tip">
  Dica com lista:

  - x
</Callout>

<DosDonts variant="dont" title="Evite" coverImage="./a.png" coverAlt="A">
  Texto.
</DosDonts>
`;
    const first = parse(source);
    expect(first.diagnostics).toEqual([]);
    expectRoundTrip(first.doc);
  });
});

describe('escapes', () => {
  const tricky = [
    'snake_case, _ênfase_ falsa, *asterisco*, `crase`, [colchete], <tag>, {chave}, ~til~ e \\ barra',
    '# não é heading',
    '- não é lista',
    '+ também não',
    '> nem citação',
    '1. nem lista numerada',
    '2) nem esta',
    '---',
    '&amp; fica literal, & solto também, &#32; idem',
    '  espaço nas pontas  ',
    'pipe | fora de tabela',
    'heading com # no fim #',
  ];

  for (const t of tricky) {
    it(`parágrafo: ${JSON.stringify(t)}`, () => {
      expectRoundTrip({ type: 'doc', content: [p(text(t))] });
    });
  }

  it('heading com # no fim', () => {
    expectRoundTrip({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [text('C#')] }] });
    expectRoundTrip({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [text('#')] }] });
  });

  it('pipe e crase em célula de tabela', () => {
    expectRoundTrip({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [cell('tableHeader', [text('a | b')])] },
            { type: 'tableRow', content: [cell('tableCell', [text('x | `y`', [code])])] },
          ],
        },
      ],
    });
  });

  it('código inline com crases e espaços', () => {
    expectRoundTrip({
      type: 'doc',
      content: [p(text('a`b', [code]), text(' '), text('`', [code]), text(' '), text(' pad ', [code]))],
    });
  });

  it('bloco de código com cerca dentro', () => {
    expectRoundTrip({
      type: 'doc',
      content: [{ type: 'codeBlock', attrs: { language: 'markdown' }, content: [text('```js\nx\n```')] }],
    });
  });

  it('link com espaço, parênteses e aspas no título', () => {
    expectRoundTrip({ type: 'doc', content: [p(text('t', [link('./a b (c).mdx', 'diz "oi"')]))] });
  });

  it('imagem com colchete no alt e aspas na legenda', () => {
    expectRoundTrip({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: './a.png', alt: 'a [b]', caption: 'diz "oi"' } }],
    });
  });

  it('props com aspas simples e duplas', () => {
    expectRoundTrip({
      type: 'doc',
      content: [
        {
          type: 'dosDonts',
          attrs: { variant: 'do', titulo: `it's "x" &amp;`, cover: null },
          content: [p(text('a'))],
        },
      ],
    });
  });

  it('marks com espaço na borda e vizinhos com o mesmo mark', () => {
    expectRoundTrip({ type: 'doc', content: [p(text('a '), text('b ', [bold]), text('c', [bold, italic]), text(' d'))] });
  });

  it('parágrafo inteiro sublinhado', () => {
    expectRoundTrip({ type: 'doc', content: [p(text('tudo', [underline]))] });
  });

  it('listas vizinhas do mesmo tipo não se fundem', () => {
    const bullet = { type: 'bulletList', content: [item(p(text('a')))] };
    const ordered = { type: 'orderedList', attrs: { start: 1, type: null }, content: [item(p(text('b')))] };
    expectRoundTrip({ type: 'doc', content: [bullet, bullet, bullet, ordered, ordered] });
  });
});

describe('frontmatter', () => {
  it('na ordem dada, sem os campos vazios', () => {
    const { source } = serializeDocument(
      { type: 'doc', content: [p(text('Corpo.'))] },
      { frontmatter: { title: 'Paleta: base', subtitle: undefined, order: 2, status: null } },
    );
    expect(source).toBe('---\ntitle: "Paleta: base"\norder: 2\n---\n\nCorpo.\n');
    const back = parseDocument(source, { file: 'p.mdx', format: 'mdx', kind: 'page' });
    expect(back.diagnostics).toEqual([]);
    expect(back.frontmatter).toEqual({ title: 'Paleta: base', order: 2 });
  });

  it('só frontmatter, sem corpo', () => {
    expect(serializeDocument({ type: 'doc', content: [] }, { frontmatter: { title: 'T' } }).source).toBe('---\ntitle: T\n---\n');
  });
});

describe('o que o formato não representa vira aviso', () => {
  const warn = (content: TiptapNode[]) => {
    const { source, warnings } = serializeDocument({ type: 'doc', content });
    // O que sai continua válido, mesmo simplificado.
    expect(parse(source).diagnostics, source).toEqual([]);
    return { source, warnings };
  };

  it('heading de nível 4 vira nível 3', () => {
    const { source, warnings } = warn([{ type: 'heading', attrs: { level: 4 }, content: [text('Fundo')] }]);
    expect(source).toBe('### Fundo\n');
    expect(warnings).toEqual([expect.stringContaining('nível 4')]);
  });

  it('embed sem variante é removido', () => {
    const { source, warnings } = warn([{ type: 'componentEmbed', attrs: { componentName: 'Button', variantId: null } }]);
    expect(source).toBe('');
    expect(warnings).toEqual([expect.stringContaining('"Button" sem variante')]);
  });

  it('célula com blocos vira texto corrido', () => {
    const rich: TiptapNode = {
      type: 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: [120], align: null },
      content: [p(text('um')), { type: 'bulletList', content: [item(p(text('dois')))] }],
    };
    const { source, warnings } = warn([
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableCell', [text('A')])] },
          { type: 'tableRow', content: [rich] },
        ],
      },
    ]);
    expect(source).toContain('| um dois |');
    expect(warnings).toEqual([
      expect.stringContaining('texto corrido'),
      expect.stringContaining('sem linha de cabeçalho'),
      expect.stringContaining('larguras'),
    ]);
  });

  it('do/don\'t: cover de imagem sem alt ganha um; sem descrição é removido', () => {
    const { source, warnings } = warn([
      { type: 'dosDonts', attrs: { variant: 'do', titulo: 'Use', cover: { kind: 'image', src: './a.png', alt: '' } }, content: [p(text('x'))] },
      { type: 'dosDonts', attrs: { variant: 'dont', titulo: 'Vazio', cover: null }, content: [{ type: 'paragraph' }] },
    ]);
    expect(source).toContain('coverAlt="Use"');
    expect(source).not.toContain('Vazio');
    expect(warnings).toEqual([expect.stringContaining('texto alternativo'), expect.stringContaining('sem descrição')]);
  });

  it('URL solta vira link', () => {
    const { warnings } = warn([p(text('veja https://x.dev'))]);
    expect(warnings).toEqual([expect.stringContaining('vira link')]);
  });

  it('negrito colado em pontuação', () => {
    const { warnings } = warn([p(text('a'), text('"b"', [bold]), text('c'))]);
    expect(warnings).toEqual([expect.stringContaining('pontuação')]);
  });

  it('nó e mark desconhecidos', () => {
    const { warnings } = warn([
      p(text('a', [{ type: 'strike' }]), { type: 'hardBreak' }),
      { type: 'horizontalRule' },
    ]);
    expect(warnings).toEqual([
      expect.stringContaining('"strike"'),
      expect.stringContaining('"hardBreak"'),
      expect.stringContaining('"horizontalRule"'),
    ]);
  });

  it('parágrafos vazios somem sem aviso', () => {
    expect(warn([{ type: 'paragraph' }, p(text('a')), { type: 'paragraph' }])).toEqual({ source: 'a\n', warnings: [] });
  });
});
