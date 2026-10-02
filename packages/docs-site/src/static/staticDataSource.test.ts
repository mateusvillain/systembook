import { afterAll, describe, expect, it } from 'vitest';
import { buildContentTree, buildSiteData, siteDataFiles, STATIC_DATA_DIR } from '@systembook/content';
import { fsFetch, writeSiteDataDir } from '../../test/fsFetch.js';
import { createStaticDataSource } from './staticDataSource.js';

const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n\n${body}\n`;
const tree = buildContentTree([
  { path: 'index.mdx', source: '# Início' },
  { path: 'foundation/color/palette.mdx', source: page('Palette', 'Cores.') },
  { path: 'foundation/color/tokens/index.mdx', source: page('Tokens', 'Corpo.') },
  { path: 'foundation/color/tokens/usage.mdx', source: page('Uso', 'Uso.') },
]);
const preview = { url: '/meu-repo/previews/button--primary/index.html', config: null };
const { data } = buildSiteData(tree, {
  settings: { nomeDesignSystem: 'Acme', logoUrl: null, logoDarkUrl: null },
  base: '/meu-repo/',
  previews: { 'Button/primary': preview },
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

  it('nenhuma requisição fora da pasta de dados', async () => {
    const { ds, requests } = source();
    await ds.getNavTree();
    await ds.getSettings();
    await ds.getLanding();
    await ds.getPageBySlug({ menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette' });
    await ds.getComponentPreview({ componentName: 'Button', variantId: 'primary' });
    await ds.search('cores');
    await ds.resolvePath(['color', 'palette']);
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

  it('sem paths legados; busca vazia até a SYS-101', async () => {
    const { ds } = source();
    expect(await ds.resolvePath(['color', 'palette'])).toBeNull();
    expect(await ds.search('cores')).toEqual([]);
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
