import { describe, expect, it } from 'vitest';
import { buildContentTree } from './build.js';
import { buildLocaleTree } from './locale.js';
import type { ContentFile, LocaleTree } from './types.js';

const page = (title: string, extra = '') => `---\ntitle: ${title}\n${extra}---\n\nCorpo de ${title}.\n`;
const files = (entries: Record<string, string>): ContentFile[] =>
  Object.entries(entries).map(([path, source]) => ({ path, source }));

const base = buildContentTree(
  files({
    'index.mdx': '---\ntitle: Acme DS\n---\n\n# Welcome\n',
    'foundation/_menu.yml': 'title: Foundation\norder: 1\n',
    'foundation/color/_section.yml': 'title: Color\norder: 1\n',
    'foundation/color/palette.mdx': page('Palette', 'order: 2\nsubtitle: All colors.\n'),
    'foundation/color/tokens/index.mdx': page('Tokens', 'order: 1\nstatus: Beta\n'),
    'foundation/color/tokens/usage.mdx': page('Usage', 'order: 1\n'),
    'foundation/color/tokens/code.mdx': page('Code', 'order: 2\n'),
    'foundation/get-started/intro.md': page('Intro'),
    'components/actions/button.mdx': page('Button'),
    'components/actions/link.mdx': page('Link'),
  }),
  { statusTags: ['Beta'] },
);

const messages = (tree: LocaleTree) => tree.diagnostics.map((d) => `${d.file}:${d.line}: ${d.message}`);

/** Esqueleto: slug (título)[*] — `*` = documento traduzido. */
function outline(tree: LocaleTree) {
  return tree.menus.map((m) => ({
    [`${m.slug} (${m.titulo})`]: m.sections.map((s) => ({
      [`${s.slug} (${s.titulo})`]: s.pages.map((p) => {
        const label = `${p.slug} (${p.titulo})${p.body ? '*' : ''}`;
        return p.tabs.length ? `${label} [${p.tabs.map((t) => `${t.slug}${t.document ? '*' : ''}`).join(', ')}]` : label;
      }),
    })),
  }));
}

describe('tradução parcial válida', () => {
  const tree = buildLocaleTree(
    base,
    files({
      'index.md': '---\ntitle: Acme DS em português\n---\n\n# Bem-vindo\n',
      'foundation/_menu.yml': 'title: Fundamentos\nslug: fundamentos\n',
      'foundation/color/_section.yml': 'title: Cor\nslug: cor\n',
      'foundation/color/palette.md': page('Paleta', 'slug: paleta\n'),
      'foundation/color/tokens/usage.mdx': page('Uso', 'slug: uso\n'),
      'components/actions/button.mdx': page('Botão', 'slug: botao\nsubtitle: Ações.\n'),
      'components/actions/image.png': 'binário',
      'components/_rascunhos/x.mdx': page('Ignorado'),
    }),
  );

  it('sem diagnósticos', () => {
    expect(messages(tree)).toEqual([]);
  });

  it('a estrutura e a ordem vêm do original; títulos e slugs traduzidos, com fallback', () => {
    expect(outline(tree)).toEqual([
      {
        'fundamentos (Fundamentos)': [
          { 'cor (Cor)': ['tokens (Tokens) [uso*, code]', 'paleta (Paleta)*'] },
          { 'get-started (Get started)': ['intro (Intro)'] },
        ],
      },
      { 'components (Components)': [{ 'actions (Actions)': ['botao (Botão)*', 'link (Link)'] }] },
    ]);
  });

  it('o ausente fica marcado como não traduzido e aponta para o original', () => {
    const [foundation, components] = tree.menus;
    expect(foundation!.translated).toBe(true);
    expect(components!.translated).toBe(false);
    expect(foundation!.sections[1]!.translated).toBe(false);
    const tokens = foundation!.sections[0]!.pages[0]!;
    expect(tokens.body).toBeNull();
    expect(tokens.base.status).toBe('Beta');
    expect(tokens.tabs[1]!.document).toBeNull();
    expect(tokens.tabs[1]!.base.file).toBe('foundation/color/tokens/code.mdx');
  });

  it('documento traduzido: corpo e caminho do arquivo da tradução', () => {
    const palette = tree.menus[0]!.sections[0]!.pages[1]!;
    expect(palette.body?.file).toBe('foundation/color/palette.md');
    expect(palette.body?.doc.content?.[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Corpo de Paleta.' }] });
    // subtitle ausente na tradução → o do original
    expect(palette.subtitulo).toBe('All colors.');
    expect(tree.menus[1]!.sections[0]!.pages[0]!.subtitulo).toBe('Ações.');
  });

  it('landing traduzida', () => {
    expect(tree.landing).toMatchObject({ file: 'index.md', titulo: 'Acme DS em português' });
  });
});

describe('sem arquivos', () => {
  it('a árvore espelha o original, tudo sem tradução', () => {
    const tree = buildLocaleTree(base, []);
    expect(tree.diagnostics).toEqual([]);
    expect(tree.landing).toBeNull();
    expect(tree.menus.map((m) => [m.slug, m.titulo, m.translated])).toEqual([
      ['foundation', 'Foundation', false],
      ['components', 'Components', false],
    ]);
    expect(tree.menus.flatMap((m) => m.sections.flatMap((s) => s.pages.map((p) => p.body)))).toEqual([null, null, null, null, null]);
  });

  it('original sem landing: index traduzido é órfão', () => {
    const noLanding = buildContentTree(files({ 'm/s/p.mdx': page('P') }));
    const tree = buildLocaleTree(noLanding, files({ 'index.mdx': '# Oi\n' }));
    expect(tree.landing).toBeNull();
    expect(messages(tree)).toEqual([expect.stringContaining('index.mdx:1: arquivo sem par no conteúdo original')]);
  });
});

describe('erros', () => {
  it.each([
    [{ 'foundation/color/swatch.mdx': page('X') }, 'foundation/color/swatch.mdx:1: arquivo sem par no conteúdo original'],
    [{ 'foundation/color/palette/index.mdx': page('X') }, 'foundation/color/palette/index.mdx:1: arquivo sem par'],
    [{ 'foundation/color/tokens.mdx': page('X') }, 'foundation/color/tokens.mdx:1: arquivo sem par'],
    [{ 'foundation/color/tokens/api.mdx': page('X') }, 'foundation/color/tokens/api.mdx:1: arquivo sem par'],
    [{ 'solta.mdx': page('X') }, 'solta.mdx:1: arquivo sem par'],
    [{ 'patterns/forms/x.mdx': page('X'), 'patterns/_menu.yml': 'title: P\n' }, 'patterns/:1: pasta "patterns" sem par no conteúdo original'],
    [{ 'foundation/motion/_section.yml': 'title: M\n' }, 'foundation/motion/:1: pasta "foundation/motion" sem par'],
    [{ 'foundation/_menu.yml': 'title: F\norder: 2\n' }, 'foundation/_menu.yml:2: "order" não é um campo aceito numa tradução (a ordem vem do idioma padrão).'],
    [{ 'foundation/color/_section.yml': 'titel: C\n' }, 'foundation/color/_section.yml:1: "titel" não é um campo aceito numa tradução (a ordem vem do idioma padrão) (quis dizer "title"?).'],
    [{ 'foundation/color/palette.mdx': page('P', 'order: 1\n') }, 'foundation/color/palette.mdx:3: frontmatter: "order" não é um campo aceito numa tradução'],
    [{ 'foundation/color/tokens/index.mdx': page('T', 'status: Beta\n') }, 'frontmatter: "status" não é um campo aceito numa tradução'],
    [{ 'foundation/color/tokens/usage.mdx': page('U', 'order: 3\n') }, 'frontmatter: "order" não é um campo aceito em tab traduzida'],
    [{ 'foundation/color/tokens/usage.mdx': page('U', 'slug: index\n') }, 'foundation/color/tokens/usage.mdx:3: "index" é reservado ao corpo da página'],
    [{ 'foundation/color/palette.md': page('A'), 'foundation/color/palette.mdx': page('B') }, 'foundation/color/palette.mdx:1: a tradução deste arquivo já está em foundation/color/palette.md'],
    [{ 'foundation/color/Palette.MDX': page('P') }, 'foundation/color/Palette.MDX:1: extensão em maiúsculas'],
    [{ 'foundation/color/_menu.yml': 'title: X\n' }, 'foundation/color/_menu.yml:1: _menu.yml fora do lugar'],
    [{ 'foundation/color/palette.mdx': '---\nslug: paleta\n---\n' }, 'foundation/color/palette.mdx:1: frontmatter: "title" é obrigatório'],
  ])('%j', (entries, expected) => {
    expect(messages(buildLocaleTree(base, files(entries))).join('\n')).toContain(expected);
  });

  it('uma pasta órfã é relatada uma vez, não por arquivo', () => {
    const tree = buildLocaleTree(base, files({ 'patterns/a/x.mdx': page('X'), 'patterns/b/y.mdx': page('Y') }));
    expect(messages(tree)).toEqual(['patterns/:1: pasta "patterns" sem par no conteúdo original — a tradução espelha os caminhos do idioma padrão.']);
  });

  it('frontmatter inválido: o documento fica sem tradução', () => {
    const tree = buildLocaleTree(base, files({ 'foundation/color/palette.mdx': page('P', 'order: 1\n') }));
    expect(tree.menus[0]!.sections[0]!.pages[1]!.body).toBeNull();
  });
});

describe('slug repetido no mesmo nível e idioma', () => {
  it('tradução que colide com o slug original de uma irmã: arquivo:linha do slug traduzido', () => {
    const tree = buildLocaleTree(base, files({ 'components/actions/button.mdx': page('Link', 'slug: link\n') }));
    expect(messages(tree)).toEqual([
      'components/actions/button.mdx:3: página com slug "link" repetido neste idioma (já usado pelo original components/actions/link.mdx).',
    ]);
  });

  it('duas traduções com o mesmo slug: erro na segunda, apontando a primeira', () => {
    const tree = buildLocaleTree(
      base,
      files({
        'components/actions/button.mdx': page('Botão', 'slug: acao\n'),
        'components/actions/link.mdx': page('Link', 'slug: acao\n'),
      }),
    );
    expect(messages(tree)).toEqual([
      'components/actions/link.mdx:3: página com slug "acao" repetido neste idioma (já usado por components/actions/button.mdx).',
    ]);
  });

  it('tabs, seções e menus', () => {
    const tree = buildLocaleTree(
      base,
      files({
        'foundation/color/tokens/code.mdx': page('Código', 'slug: usage\n'),
        'foundation/get-started/_section.yml': 'title: Comece\nslug: color\n',
        'components/_menu.yml': 'slug: foundation\ntitle: Componentes\n',
      }),
    );
    expect(messages(tree)).toEqual([
      'foundation/color/tokens/code.mdx:3: tab com slug "usage" repetido neste idioma (já usado pelo original foundation/color/tokens/usage.mdx).',
      'foundation/get-started/_section.yml:2: seção com slug "color" repetido neste idioma (já usado pelo original foundation/color/).',
      'components/_menu.yml:1: menu com slug "foundation" repetido neste idioma (já usado pelo original foundation/).',
    ]);
  });

  it('o mesmo slug em níveis diferentes não é conflito', () => {
    const tree = buildLocaleTree(
      base,
      files({ 'foundation/color/palette.mdx': page('Cor', 'slug: color\n'), 'components/_menu.yml': 'slug: color\n' }),
    );
    expect(tree.diagnostics).toEqual([]);
  });
});
