import { describe, expect, it } from 'vitest';
import { formatDiagnostic } from '../diagnostics.js';
import { parseDocument } from './index.js';

const page = (body: string, frontmatter = 'title: Página') =>
  parseDocument(`---\n${frontmatter}\n---\n\n${body}`, { file: 'docs/m/s/p.mdx', format: 'mdx', kind: 'page' });

const text = (t: string, marks?: unknown[]) => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const link = (href: string, title: string | null = null) => ({
  type: 'link',
  attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title },
});

describe('blocos Markdown padrão', () => {
  it('headings 1–3 e parágrafo', () => {
    const { doc, diagnostics } = page('# Um\n\n## Dois\n\n### Três\n\nTexto simples.');
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([
      { type: 'heading', attrs: { level: 1 }, content: [text('Um')] },
      { type: 'heading', attrs: { level: 2 }, content: [text('Dois')] },
      { type: 'heading', attrs: { level: 3 }, content: [text('Três')] },
      { type: 'paragraph', content: [text('Texto simples.')] },
    ]);
  });

  it('quebra simples vira espaço', () => {
    const { doc } = page('linha um\nlinha dois');
    expect(doc.content).toEqual([{ type: 'paragraph', content: [text('linha um linha dois')] }]);
  });

  it('marks inline na ordem do schema, com texto fundido', () => {
    const { doc, diagnostics } = page('a **b *c*** [d `e`](https://x.dev "T") `f`');
    expect(diagnostics).toEqual([]);
    expect(doc.content?.[0]?.content).toEqual([
      text('a '),
      text('b ', [{ type: 'bold' }]),
      text('c', [{ type: 'bold' }, { type: 'italic' }]),
      text(' '),
      text('d ', [link('https://x.dev', 'T')]),
      text('e', [link('https://x.dev', 'T'), { type: 'code' }]),
      text(' '),
      text('f', [{ type: 'code' }]),
    ]);
  });

  it('listas: aninhamento, número inicial e blocos dentro do item', () => {
    const { doc, diagnostics } = page('3. um\n   - dois\n\n   ```sh\n   ls\n   ```\n4. três');
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([
      {
        type: 'orderedList',
        attrs: { start: 3, type: null },
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [text('um')] },
              { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('dois')] }] }] },
              { type: 'codeBlock', attrs: { language: 'bash' }, content: [text('ls')] },
            ],
          },
          { type: 'listItem', content: [{ type: 'paragraph', content: [text('três')] }] },
        ],
      },
    ]);
  });

  it('bloco de código: linguagem normalizada, sem linguagem e vazio', () => {
    const { doc } = page('```TSX\nconst a = 1;\n```\n\n```\nplano\n```\n\n```css\n```');
    expect(doc.content).toEqual([
      { type: 'codeBlock', attrs: { language: 'typescript' }, content: [text('const a = 1;')] },
      { type: 'codeBlock', attrs: { language: null }, content: [text('plano')] },
      { type: 'codeBlock', attrs: { language: 'css' } },
    ]);
  });

  it('imagem sozinha no parágrafo vira bloco, com legenda e referência', () => {
    const { doc, references, diagnostics } = page('![Botão primário](./img/botao.png "Estado padrão")');
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([
      { type: 'image', attrs: { src: './img/botao.png', alt: 'Botão primário', caption: 'Estado padrão' } },
    ]);
    expect(references.images.map((i) => i.src)).toEqual(['./img/botao.png']);
  });

  it('tabela GFM: cabeçalho, alinhamento da coluna e célula vazia', () => {
    const { doc, diagnostics } = page('| Token | Uso |\n| --- | :---: |\n| `--primary` |  |');
    expect(diagnostics).toEqual([]);
    const cell = (type: string, content: unknown[], align: string | null = null) => ({
      type,
      attrs: { colspan: 1, rowspan: 1, colwidth: null, align },
      content: [content.length ? { type: 'paragraph', content } : { type: 'paragraph' }],
    });
    expect(doc.content).toEqual([
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', [text('Token')]), cell('tableHeader', [text('Uso')], 'center')] },
          { type: 'tableRow', content: [cell('tableCell', [text('--primary', [{ type: 'code' }])]), cell('tableCell', [], 'center')] },
        ],
      },
    ]);
  });

  it('links e imagens são coletados como referências, com posição', () => {
    const { references } = page('[a](../outra.mdx#uso) e [b](https://x.dev)\n\n![i](./i.png)');
    expect(references.links).toEqual([
      { href: '../outra.mdx#uso', line: 5, column: 1 },
      { href: 'https://x.dev', line: 5, column: 25 },
    ]);
    expect(references.images).toEqual([{ src: './i.png', line: 7, column: 1 }]);
  });

  it('ênfase do mesmo tipo aninhada não duplica o mark', () => {
    const { doc, diagnostics } = page('**a **b** c** *d *e* f*');
    expect(diagnostics).toEqual([]);
    expect(doc.content?.[0]?.content).toEqual([
      text('a b c', [{ type: 'bold' }]),
      text(' '),
      text('d e f', [{ type: 'italic' }]),
    ]);
  });

  it('<u> vira sublinhado, inline e sozinho na linha', () => {
    const { doc, diagnostics } = page('Texto <u>**forte**</u> fim.\n\n<u>Linha toda</u>');
    expect(diagnostics).toEqual([]);
    expect(doc.content).toEqual([
      {
        type: 'paragraph',
        content: [text('Texto '), text('forte', [{ type: 'bold' }, { type: 'underline' }]), text(' fim.')],
      },
      { type: 'paragraph', content: [text('Linha toda', [{ type: 'underline' }])] },
    ]);
  });

  it('arquivo .md sem frontmatter de landing é válido e vazio', () => {
    const result = parseDocument('', { file: 'docs/index.md', format: 'md', kind: 'landing' });
    expect(result).toMatchObject({ frontmatter: {}, doc: { type: 'doc', content: [] }, diagnostics: [] });
  });
});

describe('o que o CMS não representa vira erro com posição', () => {
  const messages = (body: string) => page(body).diagnostics.map(formatDiagnostic);

  it.each([
    ['#### Quatro', 'heading de nível 4'],
    ['> citação', 'use <Callout>'],
    ['---\n\n---', ''],
    ['~~fora~~', 'tachado'],
    ['linha  \nquebrada', 'quebra de linha forçada'],
    ['- [ ] tarefa', 'lista de tarefas'],
    ['texto ![img](a.png) no meio', 'imagem no meio do texto'],
    ['[ref][1]\n\n[1]: https://x.dev', 'link por referência'],
    ['a {1 + 1}', 'expressões'],
    ["import X from './x'", '`import`/`export`'],
    ['<Badge />', '<Badge> não é um componente aceito'],
    ['texto <Badge>x</Badge> inline', '<Badge> não é um componente aceito'],
    ['<u class="x">a</u>', '<u> não aceita props'],
    ['[](https://x.dev)', 'link sem texto'],
    ['```ts title="x.ts"\nconst a = 1\n```', 'metadados do bloco de código'],
    ['| a |\n| - |\n| ![i](x.png) |', 'imagem não pode ficar em célula de tabela'],
  ])('%j', (body, expected) => {
    const found = messages(body);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join('\n')).toContain(expected);
  });

  it('a posição aponta a linha e coluna no arquivo (frontmatter incluído)', () => {
    expect(messages('ok\n\n#### fora')).toEqual([
      'docs/m/s/p.mdx:7:1  heading de nível 4 não é suportado — use até ###.',
    ]);
  });

  it('problemas dentro de um heading recusado também aparecem', () => {
    const found = messages('#### ~~x~~');
    expect(found).toHaveLength(2);
    expect(found.join('\n')).toContain('tachado');
  });

  it('em .md, HTML é erro (sem componentes)', () => {
    const { diagnostics } = parseDocument('<u>x</u>', { file: 'a.md', format: 'md', kind: 'landing' });
    expect(diagnostics.map((d) => d.message).join()).toContain('HTML não é suportado');
  });

  it('MDX malformado vira diagnóstico, não exceção', () => {
    const { diagnostics } = page('<Callout');
    expect(diagnostics[0]?.message).toMatch(/^sintaxe inválida/);
  });
});

describe('frontmatter', () => {
  it('o erro aponta a linha do campo', () => {
    const { diagnostics } = parseDocument('---\ntitle: A\norder: x\ntitel: B\n---\n', {
      file: 'f.mdx',
      format: 'mdx',
      kind: 'page',
    });
    expect(diagnostics.map((d) => `${d.line}: ${d.message}`).sort()).toEqual([
      '3: frontmatter: "order" precisa ser um número.',
      '4: frontmatter: "titel" não é um campo aceito (quis dizer "title"?).',
    ]);
  });

  const fm = (yaml: string, kind: 'page' | 'tab' | 'landing' = 'page') =>
    parseDocument(`---\n${yaml}\n---\n`, { file: 'f.mdx', format: 'mdx', kind });

  it('página válida', () => {
    expect(fm('title: Botão\nsubtitle: Ações\norder: 2\nstatus: Beta\nslug: botao').frontmatter).toEqual({
      title: 'Botão',
      subtitle: 'Ações',
      order: 2,
      status: 'Beta',
      slug: 'botao',
    });
  });

  it.each([
    ['subtitle: x', 'page', '"title" é obrigatório'],
    ['title: A\ntitel: B', 'page', '"titel" não é um campo aceito (quis dizer "title"?)'],
    ['title: A\norder: 1.5', 'page', '"order" precisa ser um número inteiro'],
    ['title: A\norder: primeiro', 'page', '"order" precisa ser um número'],
    ['title: A\nslug: Botão Novo', 'page', '"slug" precisa ser um slug'],
    ['title: A\nstatus: Beta', 'tab', '"status" não é um campo aceito em tab'],
    ['title: A\norder: 1', 'landing', 'na landing (só `title`)'],
    ['title: [', 'page', 'YAML inválido'],
  ] as const)('%j (%s)', (yaml, kind, expected) => {
    const result = fm(yaml, kind);
    expect(result.frontmatter).toBeNull();
    expect(result.diagnostics.map((d) => d.message).join('\n')).toContain(expected);
  });
});
