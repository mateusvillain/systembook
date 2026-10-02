import { describe, expect, it } from 'vitest';
import { buildContentTree } from '../tree/build.js';
import { buildSiteData } from './build.js';
import { blockPlainText, createSearchIndex, loadSearchIndex, querySearchIndex, snippet } from './search.js';

const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n\n${body}\n`;
const tree = buildContentTree(
  Object.entries({
    'foundation/color/palette.mdx': page(
      'Palette',
      '## Cores primárias\n\nA paleta define as cores de ação, de fundo e de texto usadas em todos os componentes do sistema.\n\n```ts\nconst segredo = 1\n```',
    ),
    'foundation/color/tokens/index.mdx': page('Tokens', '<Callout>Tokens de **contraste** acessível.</Callout>'),
    'foundation/color/tokens/usage.mdx': page('Uso', '| Token | Uso |\n| --- | --- |\n| primary | botões de ação |'),
    'components/actions/button.mdx': page('Button', '<DosDonts variant="do" title="Verbo no rótulo">Use verbos de ação.</DosDonts>'),
  }).map(([path, source]) => ({ path, source })),
);
const { data } = buildSiteData(tree, { settings: { nomeDesignSystem: 'X', logoUrl: null, logoDarkUrl: null } });
// Ida e volta pelo JSON, como no site.
const index = loadSearchIndex(JSON.parse(JSON.stringify(createSearchIndex(data))));
const search = (q: string) => querySearchIndex(index, q);

describe('busca do modo estático', () => {
  it('resultado no formato do CMS, com snippet destacado entre STX/ETX', () => {
    expect(search('paleta')).toEqual([
      {
        pageId: 'foundation/color/palette',
        pageTitulo: 'Palette',
        pageSlug: 'palette',
        sectionTitulo: 'Color',
        sectionSlug: 'color',
        menuSlug: 'foundation',
        snippet: '…primárias A \u0002paleta\u0003 define as cores de ação, de fundo e de…',
      },
    ]);
  });

  it('prefixo, sem acento e sem caixa', () => {
    expect(search('PRIMAR').map((r) => r.pageId).sort()).toEqual(['foundation/color/palette', 'foundation/color/tokens']);
    expect(search('acao').map((r) => r.pageId).sort()).toEqual([
      'components/actions/button',
      'foundation/color/palette',
      'foundation/color/tokens',
    ]);
  });

  it('todos os termos precisam casar; texto de tab, callout, tabela e dos-donts entra; código não', () => {
    expect(search('contraste acessível').map((r) => r.pageId)).toEqual(['foundation/color/tokens']);
    expect(search('contraste paleta')).toEqual([]);
    expect(search('botões').map((r) => r.pageId)).toEqual(['foundation/color/tokens']);
    expect(search('verbo').map((r) => r.pageId)).toEqual(['components/actions/button']);
    expect(search('segredo')).toEqual([]);
  });

  it('casou só pelo título: o trecho é o começo do conteúdo, sem destaque', () => {
    expect(search('button')[0]!.snippet).toBe('Verbo no rótulo Use verbos de ação.');
  });

  it('texto e consulta em NFD casam (acento decomposto não parte a palavra); _ separa termos', () => {
    expect(search('ação'.normalize('NFD')).length).toBe(3);
    expect(snippet('foo_bar baz', ['bar'])).toBe('foo_\u0002bar\u0003 baz');
  });

  it('consulta sem termos é vazia', () => {
    expect(search('  !! ')).toEqual([]);
  });
});

describe('snippet', () => {
  it('a janela é a que reúne mais termos distintos', () => {
    const text = ['alfa', ...Array.from({ length: 20 }, (_, i) => `x${i}`), 'alfa', 'beta', 'x'].join(' ');
    expect(snippet(text, ['alfa', 'beta'])).toBe('…x11 x12 x13 x14 x15 x16 x17 x18 x19 \u0002alfa\u0003 \u0002beta\u0003 x');
  });

  it('janela de 12 termos em volta do primeiro casado, com … nas pontas cortadas', () => {
    const text = Array.from({ length: 30 }, (_, i) => `t${i}`).join(' ');
    expect(snippet(text, ['t15'])).toBe('…t13 t14 \u0002t15\u0003 t16 t17 t18 t19 t20 t21 t22 t23 t24…');
    expect(snippet(text, ['t29'])).toBe('…t18 t19 t20 t21 t22 t23 t24 t25 t26 t27 t28 \u0002t29\u0003');
  });
});

describe('blockPlainText', () => {
  it('dos-donts junta título e descrição; tipos sem prosa ficam vazios', () => {
    expect(
      blockPlainText('dos-donts', { titulo: 'Faça', descricao: [{ type: 'paragraph', content: [{ type: 'text', text: 'isto' }] }] }),
    ).toBe('Faça isto');
    expect(blockPlainText('code', { body: 'x' })).toBe('');
  });
});
