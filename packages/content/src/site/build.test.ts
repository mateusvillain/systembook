import { describe, expect, it } from 'vitest';
import type { StaticSiteData } from '@systembook/schema';
import { buildContentTree } from '../tree/build.js';
import { buildLocaleTree } from '../tree/locale.js';
import { buildSiteData, siteDataFiles, siteDataFilesByLocale } from './build.js';
import { loadSearchIndex, querySearchIndex } from './search.js';

const page = (title: string, body: string, extra = '') => `---\ntitle: ${title}\n${extra}---\n\n${body}\n`;

const FILES = {
  'index.mdx': '---\ntitle: Acme\n---\n\nVeja a [paleta](foundation/color/palette.mdx).\n',
  'foundation/color/palette.mdx': page(
    'Palette',
    '![Paleta](./img/palette.png "Cores")\n\nVolte para os [tokens](./tokens/index.mdx#uso), o [uso](tokens/usage.mdx), o [início](../../index.mdx), o [site](/foundation) ou [fora](https://x.dev).',
    'subtitle: As cores.\norder: 1\n',
  ),
  'foundation/color/tokens/index.mdx': page('Tokens', 'Corpo.\n\n<Callout>Ver [paleta](../palette.mdx).</Callout>\n\n![T](./t.png)', 'order: 2\n'),
  'foundation/color/tokens/usage.mdx': page('Uso', '![](https://cdn.x.dev/a.png)\n\n![b](/shared/b.png)'),
  'components/actions/button.mdx': page('Button', '<DosDonts variant="do" coverImage="../../img/do.png" coverAlt="Certo">Ok.</DosDonts>'),
};

const settings = { nomeDesignSystem: 'Acme DS', logoUrl: null, logoDarkUrl: null, locales: [{ code: 'en', label: 'English' }], defaultLocale: 'en' };

function build(base = '/meu-repo/', files: Record<string, string> = FILES, imageUrl?: (path: string) => string) {
  const tree = buildContentTree(Object.entries(files).map(([path, source]) => ({ path, source })));
  expect(tree.diagnostics).toEqual([]);
  return buildSiteData(tree, { settings, base, imageUrl });
}

/** Todos os `src` de imagem (bloco e cover) de um conjunto de blocos. */
function srcs(value: unknown): string[] {
  const out: string[] = [];
  JSON.stringify(value, (key, v) => {
    if (key === 'src' && typeof v === 'string') out.push(v);
    return v;
  });
  return out;
}

/** Todos os hrefs de links de um conjunto de blocos. */
function hrefs(value: unknown): string[] {
  const out: string[] = [];
  JSON.stringify(value, (key, v) => {
    if (v && typeof v === 'object' && v.type === 'link') out.push(v.attrs.href);
    return v;
  });
  return out;
}

describe('buildSiteData', () => {
  const { data, images, diagnostics } = build();

  it('sem diagnósticos', () => {
    expect(diagnostics).toEqual([]);
  });

  it('navegação no formato do contrato público, com ids estáveis', () => {
    expect(data.nav).toEqual([
      {
        id: 'components',
        titulo: 'Components',
        slug: 'components',
        ordem: 0,
        sections: [{ id: 'components/actions', titulo: 'Actions', slug: 'actions', pages: [{ id: 'components/actions/button', titulo: 'Button', slug: 'button' }] }],
      },
      {
        id: 'foundation',
        titulo: 'Foundation',
        slug: 'foundation',
        ordem: 1,
        sections: [
          {
            id: 'foundation/color',
            titulo: 'Color',
            slug: 'color',
            pages: [
              { id: 'foundation/color/palette', titulo: 'Palette', slug: 'palette' },
              { id: 'foundation/color/tokens', titulo: 'Tokens', slug: 'tokens' },
            ],
          },
        ],
      },
    ]);
    expect(data.settings).toEqual(settings);
  });

  it('página: corpo como tab primária "index" e as tabs pelo slug, blocos com ids e tabId', () => {
    const tokens = data.pages['foundation/color/tokens']!;
    expect(tokens).toMatchObject({ pageId: 'foundation/color/tokens', titulo: 'Tokens', subtitulo: null });
    expect(tokens.snapshot!.tabs.map((t) => [t.tabId, t.titulo, t.isPrimary])).toEqual([
      ['index', 'Overview', true],
      ['usage', 'Uso', false],
    ]);
    const [first] = tokens.snapshot!.tabs[0]!.blocks;
    expect(first).toEqual({
      id: 'foundation/color/tokens#index#0',
      tabId: 'index',
      ordem: 0,
      type: 'paragraph',
      content: { body: [{ type: 'text', text: 'Corpo.' }] },
    });
    expect(data.pages['foundation/color/palette']!.subtitulo).toBe('As cores.');
  });

  it('links relativos viram URLs do site com a base; âncora preservada; externos intactos', () => {
    expect(hrefs(data.pages['foundation/color/palette'])).toEqual([
      '/meu-repo/foundation/color/tokens#uso',
      '/meu-repo/foundation/color/tokens/usage',
      '/meu-repo/',
      '/meu-repo/foundation',
      'https://x.dev',
    ]);
    expect(hrefs(data.landing)).toEqual(['/meu-repo/foundation/color/palette']);
    // dentro de componente também
    expect(hrefs(data.pages['foundation/color/tokens'])).toEqual(['/meu-repo/foundation/color/palette']);
  });

  it('base na raiz', () => {
    expect(hrefs(build('/').data.landing)).toEqual(['/foundation/color/palette']);
  });

  it('imagens listadas com o caminho resolvido no diretório de conteúdo', () => {
    // na ordem da navegação
    expect(images.map(({ file, src, path, url }) => [file, src, path, url])).toEqual([
      ['components/actions/button.mdx', '../../img/do.png', 'img/do.png', '/meu-repo/img/do.png'],
      ['foundation/color/palette.mdx', './img/palette.png', 'foundation/color/img/palette.png', '/meu-repo/foundation/color/img/palette.png'],
      ['foundation/color/tokens/index.mdx', './t.png', 'foundation/color/tokens/t.png', '/meu-repo/foundation/color/tokens/t.png'],
      ['foundation/color/tokens/usage.mdx', 'https://cdn.x.dev/a.png', null, 'https://cdn.x.dev/a.png'],
      ['foundation/color/tokens/usage.mdx', '/shared/b.png', 'shared/b.png', '/meu-repo/shared/b.png'],
    ]);
  });

  it('src das imagens e do cover reescrito para a URL no site', () => {
    expect(srcs(data.pages['components/actions/button'])).toEqual(['/meu-repo/img/do.png']);
    expect(srcs(data.pages['foundation/color/palette'])).toEqual(['/meu-repo/foundation/color/img/palette.png']);
    // corpo de página com tabs: a URL é /…/tokens, então o relativo cru resolveria uma pasta acima
    expect(srcs(data.pages['foundation/color/tokens'])).toEqual([
      '/meu-repo/foundation/color/tokens/t.png',
      'https://cdn.x.dev/a.png',
      '/meu-repo/shared/b.png',
    ]);
  });

  it('imageUrl troca a URL das imagens (o build usa para o nome com hash)', () => {
    const { data, images } = build('/', FILES, (path) => `/assets/${path.replaceAll('/', '-')}`);
    expect(srcs(data.pages['foundation/color/palette'])).toEqual(['/assets/foundation-color-img-palette.png']);
    expect(images.find((i) => i.path === null)!.url).toBe('https://cdn.x.dev/a.png');
  });

  it('imagem fora do diretório de conteúdo vira erro com posição', () => {
    const tree = buildContentTree([{ path: 'm/s/p.mdx', source: page('P', '![x](../../../fora.png)') }]);
    const result = buildSiteData(tree, { settings });
    expect(result.diagnostics.map((d) => `${d.file}:${d.line}:${d.column}`)).toEqual(['m/s/p.mdx:5:1']);
    expect(result.diagnostics[0]!.message).toContain('fora do diretório de conteúdo');
    expect(result.images).toEqual([]);
  });

  it('link relativo para arquivo que não é página vira erro com posição', () => {
    const tree = buildContentTree([{ path: 'm/s/p.mdx', source: page('P', 'Ver [x](./nao-existe.mdx) e [y](../../../../fora.mdx).') }]);
    const result = buildSiteData(tree, { settings });
    expect(result.diagnostics.map((d) => `${d.file}:${d.line}:${d.column}`)).toEqual(['m/s/p.mdx:5:5', 'm/s/p.mdx:5:29']);
    expect(result.diagnostics[0]!.message).toContain('não leva a uma página ou tab');
  });

  it('sem landing, landing é null', () => {
    const tree = buildContentTree([{ path: 'm/s/p.mdx', source: page('P', 'x') }]);
    expect(buildSiteData(tree, { settings }).data.landing).toBeNull();
  });
});

describe('siteDataFiles', () => {
  it('arquivos nos caminhos do contrato, e determinístico', () => {
    const files = siteDataFiles(build().data);
    expect([...files.keys()]).toEqual([
      'settings.json',
      'nav.json',
      'landing.json',
      'previews.json',
      'tokens.json', // da raiz dos dados — não é a página foundation/color/tokens
      'search.json',
      'pages/components/actions/button.json',
      'pages/foundation/color/palette.json',
      'pages/foundation/color/tokens.json',
    ]);
    expect(JSON.parse(files.get('pages/foundation/color/tokens.json')!).titulo).toBe('Tokens');
    // mesma entrada (em outra ordem de arquivos) → mesmos bytes
    const reversed = Object.fromEntries(Object.entries(FILES).reverse());
    expect([...siteDataFiles(build('/meu-repo/', reversed).data)]).toEqual([...files]);
  });

  it('o JSON volta como StaticSiteData', () => {
    const { data } = build();
    const files = siteDataFiles(data);
    const roundtrip: StaticSiteData = {
      settings: JSON.parse(files.get('settings.json')!),
      nav: JSON.parse(files.get('nav.json')!),
      landing: JSON.parse(files.get('landing.json')!),
      previews: JSON.parse(files.get('previews.json')!),
      tokens: JSON.parse(files.get('tokens.json')!),
      pages: Object.fromEntries(Object.keys(data.pages).map((k) => [k, JSON.parse(files.get(`pages/${k}.json`)!)])),
    };
    expect(roundtrip).toEqual(data);
  });
});

describe('tokens (SYS-130)', () => {
  const tree = buildContentTree([]);
  const settings = { nomeDesignSystem: 'X', logoUrl: null, logoDarkUrl: null, locales: [{ code: 'en', label: 'English' }], defaultLocale: 'en' };
  const set = {
    modes: ['light', 'dark'],
    tokens: [{ path: 'bg', type: 'color' as const, byMode: { light: { value: '#fff', resolvedValue: '#fff' }, dark: { value: '#000', resolvedValue: '#000' } } }],
  };

  it('vão para o tokens.json; sem tokens, ou com a lista vazia, é null', () => {
    expect(JSON.parse(siteDataFiles(buildSiteData(tree, { settings, tokens: set }).data).get('tokens.json')!)).toEqual(set);
    expect(buildSiteData(tree, { settings }).data.tokens).toBeNull();
    expect(buildSiteData(tree, { settings, tokens: { modes: ['default'], tokens: [] } }).data.tokens).toBeNull();
  });
});

describe('overviewTitle (SYS-117)', () => {
  const doc = (front: string) => `---\ntitle: Button\n${front}---\n\nCorpo\n`;
  const labelOf = (files: Record<string, string>) =>
    Object.values(build('/', files).data.pages)[0]!.snapshot!.tabs.find((t) => t.isPrimary)!.titulo;

  it('o corpo usa o overviewTitle do frontmatter, com "Overview" por padrão', () => {
    expect(labelOf({ 'm/s/button/index.mdx': doc('overviewTitle: Visão geral\n'), 'm/s/button/usage.mdx': doc('') })).toBe(
      'Visão geral',
    );
    expect(labelOf({ 'm/s/button/index.mdx': doc(''), 'm/s/button/usage.mdx': doc('') })).toBe('Overview');
  });
});

describe('idiomas (SYS-177)', () => {
  const tree = buildContentTree(Object.entries(FILES).map(([path, source]) => ({ path, source })));
  const pt = buildLocaleTree(
    tree,
    Object.entries({
      'index.md': '---\ntitle: Acme\n---\n\nVeja a [paleta](foundation/color/palette.mdx).\n',
      'foundation/_menu.yml': 'title: Fundamentos\nslug: fundamentos\n',
      'foundation/color/_section.yml': 'title: Cor\nslug: cor\n',
      'foundation/color/palette.mdx': page(
        'Paleta',
        'Cores primárias.\n\n![Paleta](./img/paleta.png)\n\nVeja o [uso](./tokens/usage.mdx), o [início](../../index.mdx) e o [quebrado](./nao-existe.mdx).',
        'slug: paleta\nsubtitle: As cores, em português.\n',
      ),
      // a página tokens não tem o corpo traduzido: a tab traduzida fica de fora do fallback
      'foundation/color/tokens/usage.mdx': page('Uso traduzido', 'Texto traduzido.', 'slug: uso\n'),
    }).map(([path, source]) => ({ path, source })),
  );
  const locales = [
    { code: 'en', label: 'English' },
    { code: 'pt-BR', label: 'Português' },
  ];
  const multi = { ...settings, locales };
  const result = buildSiteData(tree, {
    settings: multi,
    base: '/meu-repo/',
    translations: { 'pt-BR': pt },
    imageUrl: (path, locale) => `/assets/${locale ?? 'default'}/${path}`,
  });
  const en = result.locales.en!;
  const ptData = result.locales['pt-BR']!;

  it('um StaticSiteData por idioma; data é o padrão', () => {
    expect(pt.diagnostics).toEqual([]);
    expect(Object.keys(result.locales)).toEqual(['en', 'pt-BR']);
    expect(result.data).toBe(en);
    expect(ptData.settings).toEqual(multi);
  });

  it('navegação com títulos e slugs traduzidos, com o original quando falta tradução', () => {
    expect(ptData.nav.map((m) => [m.slug, m.titulo])).toEqual([
      ['components', 'Components'],
      ['fundamentos', 'Fundamentos'],
    ]);
    expect(ptData.nav[1]!.sections).toEqual([
      {
        id: 'fundamentos/cor',
        titulo: 'Cor',
        slug: 'cor',
        pages: [
          { id: 'fundamentos/cor/paleta', titulo: 'Paleta', slug: 'paleta' },
          { id: 'fundamentos/cor/tokens', titulo: 'Tokens', slug: 'tokens' },
        ],
      },
    ]);
    expect(Object.keys(ptData.pages).sort()).toEqual(['components/actions/button', 'fundamentos/cor/paleta', 'fundamentos/cor/tokens']);
  });

  it('página traduzida: locale do idioma e alternates com os slugs de cada um', () => {
    const page = ptData.pages['fundamentos/cor/paleta']!;
    expect(page).toMatchObject({ pageId: 'fundamentos/cor/paleta', titulo: 'Paleta', subtitulo: 'As cores, em português.', locale: 'pt-BR' });
    const alternates = {
      en: { menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette' },
      'pt-BR': { menuSlug: 'fundamentos', sectionSlug: 'cor', pageSlug: 'paleta' },
    };
    expect(page.alternates).toEqual(alternates);
    expect(en.pages['foundation/color/palette']!.alternates).toEqual(alternates);
    expect(page.snapshot!.tabs[0]!.blocks[0]!.content).toMatchObject({ body: [{ type: 'text', text: 'Cores primárias.' }] });
  });

  it('página sem tradução: conteúdo, textos e tabs do padrão, com locale = padrão', () => {
    const page = ptData.pages['fundamentos/cor/tokens']!;
    const original = en.pages['foundation/color/tokens']!;
    expect(page).toMatchObject({ pageId: 'fundamentos/cor/tokens', titulo: 'Tokens', locale: 'en' });
    expect(page.alternates).toEqual({ en: { menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'tokens' } });
    expect(page.snapshot!.tabs.map((t) => [t.tabId, t.titulo])).toEqual([
      ['index', 'Overview'],
      ['usage', 'Uso'],
    ]);
    expect(srcs(page)).toEqual(srcs(original));
    expect(JSON.stringify(page.snapshot)).not.toContain('traduzido');
    expect(en.pages['components/actions/button']!.alternates).toEqual({ en: { menuSlug: 'components', sectionSlug: 'actions', pageSlug: 'button' } });
  });

  it('links relativos levam à página no mesmo idioma, também no fallback', () => {
    expect(hrefs(ptData.pages['fundamentos/cor/paleta'])).toEqual([
      '/meu-repo/pt-br/fundamentos/cor/tokens/usage',
      '/meu-repo/pt-br',
      './nao-existe.mdx', // quebrado: fica como está, com o diagnóstico
    ]);
    expect(hrefs(ptData.landing)).toEqual(['/meu-repo/pt-br/fundamentos/cor/paleta']);
    expect(hrefs(ptData.pages['fundamentos/cor/tokens'])).toEqual(['/meu-repo/pt-br/fundamentos/cor/paleta']);
    // o padrão não muda
    expect(hrefs(en.landing)).toEqual(['/meu-repo/foundation/color/palette']);
  });

  it('imagens da tradução com o idioma; as do padrão não se repetem no fallback', () => {
    expect(result.images.filter((i) => i.locale === 'pt-BR').map(({ file, path, url }) => [file, path, url])).toEqual([
      ['foundation/color/palette.mdx', 'foundation/color/img/paleta.png', '/assets/pt-BR/foundation/color/img/paleta.png'],
    ]);
    expect(result.images.filter((i) => i.locale === null)).toHaveLength(5);
    expect(srcs(ptData.pages['components/actions/button'])).toEqual(['/assets/default/img/do.png']);
  });

  it('problemas dos documentos traduzidos por idioma, sem repetir os do padrão', () => {
    expect(result.diagnostics).toEqual([]);
    expect(result.translationDiagnostics['pt-BR']!.map((d) => `${d.file}:${d.line}: ${d.message}`)).toEqual([
      expect.stringMatching(/^foundation\/color\/palette\.mdx:\d+: link para "\.\/nao-existe\.mdx" não leva/),
    ]);
  });

  it('idioma sem árvore de tradução: a estrutura do padrão, toda em fallback', () => {
    const { locales: byLocale } = buildSiteData(tree, { settings: { ...settings, locales: [...locales, { code: 'es', label: 'Español' }] } });
    const es = byLocale.es!;
    expect(es.nav).toEqual(byLocale.en!.nav);
    expect(Object.values(es.pages).every((p) => p.locale === 'en')).toBe(true);
    expect(hrefs(es.landing)).toEqual(['/es/foundation/color/palette']);
  });

  it('tradução de idioma fora de settings.locales é erro de programação', () => {
    expect(() => buildSiteData(tree, { settings, translations: { 'pt-BR': pt } })).toThrow(/pt-BR/);
    expect(() => buildSiteData(tree, { settings: multi, translations: { en: pt } })).toThrow(/"en"/);
  });

  it('idioma único: a mesma saída de antes', () => {
    const single = buildSiteData(tree, { settings, base: '/meu-repo/' });
    expect(single.locales).toEqual({ en: single.data });
    expect(single.data).toEqual(build().data);
    expect(single.translationDiagnostics).toEqual({});
    expect([...siteDataFilesByLocale(single.locales)]).toEqual([...siteDataFiles(build().data)]);
  });

  it('arquivos: o padrão na raiz e cada idioma na própria pasta, com o próprio índice de busca', () => {
    const files = siteDataFilesByLocale(result.locales);
    expect([...files.keys()].filter((k) => k.startsWith('locales/'))).toEqual([
      'locales/pt-br/nav.json',
      'locales/pt-br/landing.json',
      'locales/pt-br/search.json',
      'locales/pt-br/pages/components/actions/button.json',
      'locales/pt-br/pages/fundamentos/cor/paleta.json',
      'locales/pt-br/pages/fundamentos/cor/tokens.json',
    ]);
    for (const [key, value] of siteDataFiles(en)) expect(files.get(key)).toBe(value);

    const search = (file: string, q: string) => querySearchIndex(loadSearchIndex(JSON.parse(files.get(file)!)), q);
    expect(search('locales/pt-br/search.json', 'primárias').map((r) => [r.menuSlug, r.sectionSlug, r.pageSlug, r.sectionTitulo])).toEqual([
      ['fundamentos', 'cor', 'paleta', 'Cor'],
    ]);
    expect(search('search.json', 'primárias')).toEqual([]);
  });
});
