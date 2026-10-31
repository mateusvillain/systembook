import { afterAll, describe, expect, it } from 'vitest';
import { buildContentTree, buildLocaleTree, buildSiteData, siteDataFiles, siteDataFilesByLocale, STATIC_DATA_DIR } from '@systembook/content';
import { fsFetch, writeSiteDataDir } from '../../test/fsFetch.js';
import { createStaticDataSource, createStaticDataSourceFactory } from './staticDataSource.js';

const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n\n${body}\n`;
const tree = buildContentTree([
  { path: 'index.mdx', source: '# Início' },
  { path: 'foundation/color/palette.mdx', source: page('Palette', 'Cores.') },
  { path: 'foundation/color/tokens/index.mdx', source: page('Tokens', 'Corpo.') },
  { path: 'foundation/color/tokens/usage.mdx', source: page('Uso', 'Uso.') },
]);
const preview = { url: '/meu-repo/previews/button--primary/index.html', config: null };
const { data } = buildSiteData(tree, {
  settings: { nomeDesignSystem: 'Acme', logoUrl: null, logoDarkUrl: null, locales: [{ code: 'en', label: 'English' }], defaultLocale: 'en' },
  base: '/meu-repo/',
  previews: { 'Button/primary': preview },
  tokens: {
    modes: ['default'],
    tokens: [{ path: 'color.bg', type: 'color', byMode: { default: { value: '#fff', resolvedValue: '#fff' } } }],
  },
});

const { dir, cleanup } = writeSiteDataDir(siteDataFiles(data));
afterAll(cleanup);

const DATA_URL = `/meu-repo/${STATIC_DATA_DIR}`;

function source(options: { spaFallback?: boolean } = {}) {
  const fetch = fsFetch(dir, DATA_URL, options);
  return { ds: createStaticDataSource({ dataUrl: DATA_URL, fetch }), requests: fetch.requests };
}

describe('staticDataSource', () => {
  it('lê nav, settings e landing dos JSONs', async () => {
    const { ds } = source();
    expect(await ds.getNavTree()).toEqual(data.nav);
    expect(await ds.getSettings()).toEqual(data.settings);
    expect(await ds.getLanding()).toEqual(data.landing);
  });

  it('nav e settings são lidos uma vez; cada página só quando pedida', async () => {
    const { ds, requests } = source();
    await Promise.all([ds.getNavTree(), ds.getNavTree(), ds.getSettings()]);
    await ds.getSettings();
    expect(requests).toEqual([`${DATA_URL}nav.json`, `${DATA_URL}settings.json`]);

    const tokens = await ds.getPageBySlug({ menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'tokens' });
    expect(tokens).toEqual(data.pages['foundation/color/tokens']);
    expect(requests.slice(2)).toEqual([`${DATA_URL}pages/foundation/color/tokens.json`]);
  });

  it('tokens lidos uma vez do tokens.json', async () => {
    const { ds, requests } = source();
    await Promise.all([ds.getTokens(), ds.getTokens()]);
    expect(await ds.getTokens()).toEqual(data.tokens);
    expect(requests).toEqual([`${DATA_URL}tokens.json`]);
  });

  it('tokens.json com null ou lista vazia: getTokens é null', async () => {
    for (const tokens of [null, { modes: ['default'], tokens: [] }]) {
      const empty = writeSiteDataDir(siteDataFiles({ ...data, tokens }));
      try {
        const ds = createStaticDataSource({ dataUrl: DATA_URL, fetch: fsFetch(empty.dir, DATA_URL) });
        expect(await ds.getTokens()).toBeNull();
      } finally {
        empty.cleanup();
      }
    }
  });

  it('nenhuma requisição fora da pasta de dados', async () => {
    const { ds, requests } = source();
    await ds.getNavTree();
    await ds.getSettings();
    await ds.getLanding();
    await ds.getPageBySlug({ menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette' });
    await ds.getComponentPreview({ componentName: 'Button', variantId: 'primary' });
    await ds.search('cores');
    await ds.resolvePath(['color', 'palette']);
    await ds.getTokens();
    expect(requests.every((url) => url.startsWith(DATA_URL))).toBe(true);
  });

  it('página fora da nav é null sem ir à rede — seguro com fallback de SPA', async () => {
    const { ds, requests } = source({ spaFallback: true });
    expect(await ds.getPageBySlug({ menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'nao-existe' })).toBeNull();
    expect(await ds.getPageBySlug({ menuSlug: 'x', sectionSlug: 'y', pageSlug: 'z' })).toBeNull();
    expect(requests).toEqual([`${DATA_URL}nav.json`]);
  });

  it('getPageById pelo endereço canônico', async () => {
    const { ds } = source();
    expect(await ds.getPageById('foundation/color/palette')).toEqual(data.pages['foundation/color/palette']!.snapshot);
    expect(await ds.getPageById('nao/existe/mesmo')).toBeNull();
    expect(await ds.getPageById('foundation/color/palette/extra')).toBeNull();
    expect(await ds.getPageById('foundation/color')).toBeNull();
  });

  it('previews pelo par componente/variante', async () => {
    const { ds } = source();
    expect(await ds.getComponentPreview({ componentName: 'Button', variantId: 'primary' })).toEqual(preview);
    expect(await ds.getComponentPreview({ componentName: 'Button', variantId: 'ghost' })).toBeNull();
  });

  it('sem paths legados', async () => {
    const { ds } = source();
    expect(await ds.resolvePath(['color', 'palette'])).toBeNull();
  });

  it('busca: o índice só é lido na primeira busca, e uma vez', async () => {
    const { ds, requests } = source();
    await ds.getNavTree();
    expect(requests.some((u) => u.endsWith('search.json'))).toBe(false);
    const results = await ds.search('cores');
    expect(results.map((r) => [r.pageId, r.snippet])).toEqual([['foundation/color/palette', '\u0002Cores\u0003.']]);
    await ds.search('uso');
    expect(requests.filter((u) => u.endsWith('search.json'))).toHaveLength(1);
  });

  it('arquivo de dados que volta como HTML (fallback de SPA) é erro com a URL', async () => {
    const fetch = (async () => new Response('<!doctype html>', { status: 200 })) as typeof globalThis.fetch;
    await expect(createStaticDataSource({ dataUrl: DATA_URL, fetch }).getNavTree()).rejects.toThrow(
      `${DATA_URL}nav.json não é JSON`,
    );
  });

  it('dataUrl relativa é recusada', () => {
    expect(() => createStaticDataSource({ dataUrl: STATIC_DATA_DIR })).toThrow('precisa ser absoluta');
    expect(() => createStaticDataSource({ dataUrl: 'https://cdn.x.dev/data/' })).not.toThrow();
  });

  it('falha de leitura vira erro com a URL, e a próxima chamada tenta de novo', async () => {
    let fail = true;
    const inner = fsFetch(dir, DATA_URL);
    const fetch = (async (input: string | URL | Request) =>
      fail ? new Response('erro', { status: 500 }) : inner(input)) as typeof globalThis.fetch;
    const ds = createStaticDataSource({ dataUrl: DATA_URL.slice(0, -1), fetch });
    await expect(ds.getNavTree()).rejects.toThrow(`${DATA_URL}nav.json (HTTP 500)`);
    fail = false;
    expect(await ds.getNavTree()).toEqual(data.nav);
  });
});

describe('staticDataSourceFactory — idiomas (SYS-170)', () => {
  const translation = buildLocaleTree(tree, [
    { path: 'index.md', source: '# Início traduzido' },
    { path: 'foundation/_menu.yml', source: 'title: Fundamentos\nslug: fundamentos\n' },
    { path: 'foundation/color/_section.yml', source: 'title: Cor\nslug: cor\n' },
    { path: 'foundation/color/palette.mdx', source: '---\ntitle: Paleta\nslug: paleta\n---\n\nMatizes.\n' },
  ]);
  const settings = {
    nomeDesignSystem: 'Acme',
    logoUrl: null,
    logoDarkUrl: null,
    locales: [
      { code: 'en', label: 'English' },
      { code: 'pt-BR', label: 'Português' },
    ],
    defaultLocale: 'en',
  };
  const { locales } = buildSiteData(tree, {
    settings,
    base: '/meu-repo/',
    previews: { 'Button/primary': preview },
    translations: { 'pt-BR': translation },
  });
  const multi = writeSiteDataDir(siteDataFilesByLocale(locales));
  afterAll(multi.cleanup);

  function factory() {
    const fetch = fsFetch(multi.dir, DATA_URL);
    return { factory: createStaticDataSourceFactory({ dataUrl: DATA_URL, fetch }), requests: fetch.requests };
  }
  const pt = locales['pt-BR']!;
  const paleta = { menuSlug: 'fundamentos', sectionSlug: 'cor', pageSlug: 'paleta' };

  it('cada idioma lê a própria pasta; settings, previews e tokens da raiz', async () => {
    const { factory: f, requests } = factory();
    const ds = f('pt-BR');
    expect(await ds.getNavTree()).toEqual(pt.nav);
    expect(await ds.getLanding()).toEqual(pt.landing);
    expect(await ds.getSettings()).toEqual(settings);
    expect(await ds.getComponentPreview({ componentName: 'Button', variantId: 'primary' })).toEqual(preview);
    expect(requests).toEqual([
      `${DATA_URL}settings.json`,
      `${DATA_URL}locales/pt-br/nav.json`,
      `${DATA_URL}locales/pt-br/landing.json`,
      `${DATA_URL}previews.json`,
    ]);
  });

  it('getPageBySlug devolve locale e alternates; fallback com o locale do padrão', async () => {
    const ds = factory().factory('pt-BR');
    const page = await ds.getPageBySlug(paleta);
    expect(page).toEqual(pt.pages['fundamentos/cor/paleta']);
    expect(page).toMatchObject({
      locale: 'pt-BR',
      alternates: { en: { menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette' }, 'pt-BR': paleta },
    });
    expect(await ds.getPageBySlug({ menuSlug: 'fundamentos', sectionSlug: 'cor', pageSlug: 'tokens' })).toMatchObject({ locale: 'en' });
    // slug do padrão não existe na navegação traduzida
    expect(await ds.getPageBySlug({ menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette' })).toBeNull();
  });

  it('a busca usa o índice do idioma', async () => {
    const { factory: f, requests } = factory();
    expect((await f('pt-BR').search('matizes')).map((r) => [r.menuSlug, r.sectionSlug, r.pageSlug])).toEqual([['fundamentos', 'cor', 'paleta']]);
    expect(await f(null).search('matizes')).toEqual([]);
    expect(requests.filter((u) => u.endsWith('search.json'))).toEqual([`${DATA_URL}locales/pt-br/search.json`, `${DATA_URL}search.json`]);
  });

  it('null e o código do padrão leem a raiz; a mesma fonte para o mesmo idioma', async () => {
    const { factory: f } = factory();
    expect(f('pt-BR')).toBe(f('pt-BR'));
    expect(await f(null).getNavTree()).toEqual(locales.en!.nav);
    expect(await f('en').getNavTree()).toEqual(locales.en!.nav);
  });

  it('idioma não publicado é erro', async () => {
    await expect(factory().factory('fr').getNavTree()).rejects.toThrow('"fr" não está publicado');
  });

  it('com idioma único, os mesmos arquivos e leituras de antes', async () => {
    const fetch = fsFetch(dir, DATA_URL);
    const ds = createStaticDataSourceFactory({ dataUrl: DATA_URL, fetch })(null);
    await ds.getNavTree();
    await ds.getPageBySlug({ menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette' });
    await ds.search('cores');
    expect(fetch.requests).toEqual([`${DATA_URL}nav.json`, `${DATA_URL}pages/foundation/color/palette.json`, `${DATA_URL}search.json`]);
  });
});
