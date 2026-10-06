import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContentTree } from './build.js';
import { readContentDir } from '../node.js';
import type { ContentFile, ContentTree } from './types.js';

const page = (title: string, extra = '') => `---\ntitle: ${title}\n${extra}---\n\nCorpo de ${title}.\n`;
const files = (entries: Record<string, string>): ContentFile[] =>
  Object.entries(entries).map(([path, source]) => ({ path, source }));

/** Esqueleto legível: menu/seção/página[tabs] com títulos. */
function outline(tree: ContentTree) {
  return tree.menus.map((m) => ({
    [`${m.slug} (${m.titulo})`]: m.sections.map((s) => ({
      [`${s.slug} (${s.titulo})`]: s.pages.map((p) =>
        p.tabs.length ? `${p.slug} [${p.tabs.map((t) => t.slug).join(', ')}]` : p.slug,
      ),
    })),
  }));
}

const messages = (tree: ContentTree) => tree.diagnostics.map((d) => `${d.file}: ${d.message}`);

describe('estrutura válida', () => {
  const tree = buildContentTree(
    files({
      'index.mdx': '---\ntitle: Acme DS\n---\n\n# Bem-vindo\n',
      'foundation/_menu.yml': 'title: Fundamentos\norder: 1\n',
      'foundation/color/_section.yml': 'order: 2\n',
      'foundation/color/palette.mdx': page('Palette', 'order: 2\n'),
      'foundation/color/tokens/index.mdx': page('Tokens', 'subtitle: Os tokens.\nstatus: Beta\norder: 1\n'),
      'foundation/color/tokens/usage.mdx': page('Uso', 'order: 2\n'),
      'foundation/color/tokens/code.md': page('Código', 'order: 1\n'),
      'foundation/color/tokens/api.mdx': page('API'),
      'foundation/get-started/intro.md': page('Intro'),
      'components/actions/button.mdx': page('Button'),
      'components/actions/link-button.mdx': page('Link button', 'slug: link\n'),
      'components/empty-section/_section.yml': 'title: Vazia\n',
      'components/_drafts/x.mdx': page('Rascunho'),
      'components/actions/_old.mdx': page('Antigo'),
      'components/actions/image.png': 'binário',
      '.github/x.md': page('ignorado'),
    }),
    { statusTags: ['Stable', 'Beta'] },
  );

  it('sem diagnósticos', () => {
    expect(messages(tree)).toEqual([]);
  });

  it('menus, seções e páginas ordenados por order e depois slug, com títulos humanizados', () => {
    expect(outline(tree)).toEqual([
      {
        'foundation (Fundamentos)': [
          { 'color (Color)': ['tokens [code, usage, api]', 'palette'] },
          { 'get-started (Get started)': ['intro'] },
        ],
      },
      { 'components (Components)': [{ 'actions (Actions)': ['button', 'link'] }] },
    ]);
  });

  it('a seção com order vem antes da sem order', () => {
    // color tem order 2 e get-started nenhum → color primeiro, apesar do alfabeto.
    expect(tree.menus[0]!.sections.map((s) => s.slug)).toEqual(['color', 'get-started']);
  });

  it('página com tabs: frontmatter do index, corpo e tabs', () => {
    const tokens = tree.menus[0]!.sections[0]!.pages[0]!;
    expect(tokens).toMatchObject({ slug: 'tokens', titulo: 'Tokens', subtitulo: 'Os tokens.', status: 'Beta', order: 1 });
    expect(tokens.body.file).toBe('foundation/color/tokens/index.mdx');
    expect(tokens.tabs.map((t) => [t.slug, t.titulo, t.file])).toEqual([
      ['code', 'Código', 'foundation/color/tokens/code.md'],
      ['usage', 'Uso', 'foundation/color/tokens/usage.mdx'],
      ['api', 'API', 'foundation/color/tokens/api.mdx'],
    ]);
    expect(tokens.tabs[0]!.doc.content?.[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Corpo de Código.' }] });
  });

  it('landing com título', () => {
    expect(tree.landing).toMatchObject({ file: 'index.mdx', titulo: 'Acme DS' });
    expect(tree.landing?.doc.content?.[0]).toMatchObject({ type: 'heading' });
  });
});

describe('overviewTitle (SYS-117)', () => {
  const build = (entries: Record<string, string>) => buildContentTree(files(entries));

  it('vira o rótulo do corpo na página com tabs e em página de arquivo único; ausente é null', () => {
    const tree = build({
      'm/s/with-tabs/index.mdx': page('Com tabs', 'overviewTitle: Visão geral\n'),
      'm/s/with-tabs/usage.mdx': page('Uso'),
      'm/s/single.mdx': page('Única', 'overviewTitle: Design\n'),
      'm/s/plain.mdx': page('Simples'),
    });
    expect(messages(tree)).toEqual([]);
    const pages = Object.fromEntries(tree.menus[0]!.sections[0]!.pages.map((p) => [p.slug, p.overviewTitulo]));
    expect(pages).toEqual({ 'with-tabs': 'Visão geral', single: 'Design', plain: null });
  });

  it('em arquivo de tab é campo desconhecido', () => {
    const tree = build({
      'm/s/p/index.mdx': page('P'),
      'm/s/p/usage.mdx': page('Uso', 'overviewTitle: Nope\n'),
    });
    expect(messages(tree).join('\n')).toContain('overviewTitle');
  });

  it('vazio é erro', () => {
    const tree = build({ 'm/s/p.mdx': page('P', 'overviewTitle: ""\n') });
    expect(messages(tree).join('\n')).toContain('overviewTitle');
  });
});

describe('sem landing', () => {
  it('landing é null e não é erro', () => {
    const tree = buildContentTree(files({ 'm/s/p.mdx': page('P') }));
    expect(tree.landing).toBeNull();
    expect(tree.diagnostics).toEqual([]);
  });
});

describe('erros de estrutura', () => {
  it.each([
    [{ 'solta.mdx': page('X') }, 'solta.mdx: página na raiz do conteúdo'],
    [{ 'm/solta.mdx': page('X') }, 'm/solta.mdx: página direto no menu'],
    [{ 'm/s/p/sub/x.mdx': page('X') }, 'm/s/p/sub/x.mdx: subpasta dentro da pasta de uma página'],
    [{ 'm/s/p/tab.mdx': page('T') }, 'm/s/p/: a pasta da página "p" precisa de um index.mdx'],
    [{ 'm/s/button.mdx': page('A'), 'm/s/button/index.mdx': page('B') }, 'página com slug "button" repetido'],
    [{ 'm/s/a.mdx': page('A'), 'm/s/b.mdx': page('B', 'slug: a\n') }, 'página com slug "a" repetido'],
    [{ 'Foundation/s/p.mdx': page('P') }, 'Foundation/: nome de menu "Foundation" não é um slug válido'],
    [{ 'm/Get Started/p.mdx': page('P') }, 'nome de seção "Get Started" não é um slug válido'],
    [{ 'm/s/Botão.mdx': page('P') }, 'nome de arquivo "Botão" não é um slug válido'],
    [{ 'm/s/p/index.mdx': page('P'), 'm/s/p/t.mdx': page('T', 'slug: index\n') }, '"index" é reservado ao corpo da página'],
    [{ 'm/s/p/index.mdx': page('P'), 'm/s/p/a.mdx': page('A'), 'm/s/p/b.mdx': page('B', 'slug: a\n') }, 'tab com slug "a" repetido'],
    [{ 'm/s/p.mdx': page('P', 'status: Alfa\n') }, 'status "Alfa" não existe'],
    [{ 'm/_menu.yml': 'titel: X\n', 'm/s/p.mdx': page('P') }, 'm/_menu.yml: "titel" não é um campo aceito (quis dizer "title"?)'],
    [{ 'm/s/_section.yml': 'order: [\n', 'm/s/p.mdx': page('P') }, 'm/s/_section.yml: YAML inválido'],
    [{ 'index.md': '', 'index.mdx': '' }, 'a landing já está em index.md'],
    [{ 'm/s/p/index.md': page('A'), 'm/s/p/index.mdx': page('B') }, 'o corpo da página já está em'],
    [{ 'm/s/p.mdx': page('P', 'subtitle: x\n').replace('title: P\n', '') }, 'm/s/p.mdx: frontmatter: "title" é obrigatório'],
    [{ 'm/s/_menu.yml': 'title: X\n', 'm/s/p.mdx': page('P') }, 'm/s/_menu.yml: _menu.yml fora do lugar'],
    [{ 'm/_section.yml': 'title: X\n', 'm/s/p.mdx': page('P') }, 'm/_section.yml: _section.yml fora do lugar'],
    [{ '_menu.yml': 'title: X\n' }, '_menu.yml: _menu.yml fora do lugar'],
    [{ 'm/s/p.MDX': page('P') }, 'm/s/p.MDX: extensão em maiúsculas — renomeie para .mdx'],
    [{ 'm/s/index.mdx': page('P') }, 'm/s/index.mdx: index solto numa seção'],
    [{ 'm/_menu.yml': '- a\n- b\n', 'm/s/p.mdx': page('P') }, 'm/_menu.yml: precisa ser um mapa de campos'],
    [{ 'm/_menu.yml': 'title: 3\n', 'm/s/p.mdx': page('P') }, 'm/_menu.yml: "title" precisa ser texto.'],
  ])('%j', (entries, expected) => {
    const tree = buildContentTree(files(entries), { statusTags: ['Stable'] });
    expect(messages(tree).join('\n')).toContain(expected);
  });

  it('status sem statusTags na config é erro (padrão: nenhuma tag) e não vai para a página', () => {
    const tree = buildContentTree(files({ 'm/s/p.mdx': page('P', 'status: Beta\n') }));
    expect(messages(tree)).toEqual(['m/s/p.mdx: frontmatter: status "Beta" não existe — aceitas: nenhuma (defina statusTags na config).']);
    expect(tree.menus[0]!.sections[0]!.pages[0]!.status).toBeNull();
  });

  it('erro de yml aponta a linha do campo', () => {
    const tree = buildContentTree(files({ 'm/_menu.yml': 'title: M\norder: 1\nbogus: x\n', 'm/s/p.mdx': page('P') }));
    expect(tree.diagnostics.map((d) => `${d.file}:${d.line}`)).toEqual(['m/_menu.yml:3']);
  });

  it('caminhos com ./, barra invertida e barras repetidas são normalizados', () => {
    const tree = buildContentTree(files({ './m/s/a.mdx': page('A'), 'm\\s\\b.mdx': page('B'), '/m//s/c.mdx': page('C') }));
    expect(tree.diagnostics).toEqual([]);
    expect(outline(tree)).toEqual([{ 'm (M)': [{ 's (S)': ['a', 'b', 'c'] }] }]);
    expect(tree.menus[0]!.sections[0]!.pages[0]!.body.file).toBe('m/s/a.mdx');
  });

  it('um menu ou seção sem páginas válidas some, sem erro próprio', () => {
    const tree = buildContentTree(files({ 'm/s/_section.yml': 'title: S\n', 'n/t/p.mdx': page('P') }));
    expect(tree.menus.map((m) => m.slug)).toEqual(['n']);
    expect(tree.diagnostics).toEqual([]);
  });

  it('slug de menu e seção sobrescrito no yml resolve nome inválido de pasta', () => {
    const tree = buildContentTree(
      files({
        'Fundamentos/_menu.yml': 'slug: foundation\n',
        'Fundamentos/Cores/_section.yml': 'slug: color\n',
        'Fundamentos/Cores/p.mdx': page('P'),
      }),
    );
    expect(tree.diagnostics).toEqual([]);
    expect(outline(tree)).toEqual([{ 'foundation (Foundation)': [{ 'color (Color)': ['p'] }] }]);
  });

  it('erros de conteúdo de todos os arquivos aparecem juntos', () => {
    const tree = buildContentTree(files({ 'm/s/a.mdx': page('A') + '\n#### x\n', 'm/s/b.mdx': page('B') + '\n> c\n' }));
    expect(tree.diagnostics.map((d) => d.file)).toEqual(['m/s/a.mdx', 'm/s/b.mdx']);
  });
});

describe('readContentDir', () => {
  it('lê .md/.mdx e os yml de meta, com caminhos relativos e "/"', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sb-content-'));
    try {
      await mkdir(path.join(dir, 'm/s/p'), { recursive: true });
      await mkdir(path.join(dir, 'node_modules/x'), { recursive: true });
      await mkdir(path.join(dir, '.git'), { recursive: true });
      await writeFile(path.join(dir, 'index.mdx'), '# Oi');
      await writeFile(path.join(dir, 'm/_menu.yml'), 'title: M');
      await writeFile(path.join(dir, 'm/s/p/index.mdx'), page('P'));
      await writeFile(path.join(dir, 'm/s/p/img.png'), 'x');
      await writeFile(path.join(dir, 'node_modules/x/readme.md'), 'x');
      await writeFile(path.join(dir, '.git/notes.md'), 'x');
      await writeFile(path.join(dir, 'm/s/Q.MDX'), page('Q'));

      const read = await readContentDir(dir);
      expect(read.map((f) => f.path).sort()).toEqual(['index.mdx', 'm/_menu.yml', 'm/s/Q.MDX', 'm/s/p/index.mdx']);
      const tree = buildContentTree(read);
      expect(tree.menus[0]!.titulo).toBe('M');
      // a extensão em maiúsculas chega à árvore e vira erro, em vez de sumir
      expect(tree.diagnostics.map((d) => d.file)).toEqual(['m/s/Q.MDX']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
