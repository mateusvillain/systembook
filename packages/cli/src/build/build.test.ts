import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig, type ResolvedConfig } from '../config.js';
import { buildStaticSite } from './index.js';

const FIXTURE = fileURLToPath(new URL('../../fixtures/static-site', import.meta.url));
const TMP = fileURLToPath(new URL('../../.tmp', import.meta.url));
mkdirSync(TMP, { recursive: true });
const temps: string[] = [];
afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** Cópia do fixture num projeto temporário, com a base dada. */
async function fixtureConfig(base: string): Promise<ResolvedConfig> {
  const root = mkdtempSync(path.join(TMP, 'site-'));
  temps.push(root);
  cpSync(FIXTURE, root, { recursive: true, filter: (src) => !src.includes('systembook-dist') });
  return { ...(await loadConfig(root)), base };
}

/** Todos os arquivos (caminho → conteúdo) de uma pasta, em ordem. */
function tree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(path.relative(dir, full), readFileSync(full, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

const head = (html: string) => ({
  title: /<title>(.*)<\/title>/.exec(html)?.[1],
  description: /<meta name="description" content="(.*)" \/>/.exec(html)?.[1],
});

describe('systembook build', { timeout: 60_000 }, () => {
  it('em subpath: um index.html por rota, 404, dados e assets sob a base', async () => {
    const config = await fixtureConfig('/acme-ds/');
    const result = await buildStaticSite(config);
    expect(result).toEqual({ ok: true, outDir: config.outDir, routes: 5, warnings: [] });

    const files = tree(config.outDir);
    const html = [...files.keys()].filter((f) => f.endsWith('.html') && !f.startsWith('_systembook/')).sort();
    expect(html).toEqual([
      '404.html',
      'components/actions/button/index.html',
      'foundation/color/palette/index.html',
      'foundation/color/tokens/index.html',
      'foundation/color/tokens/usage/index.html',
      'index.html',
    ]);
    expect(files.has('.nojekyll')).toBe(true);
    expect([...files.keys()].filter((f) => f.startsWith('_systembook/data/')).sort()).toEqual([
            '_systembook/data/landing.json',
      '_systembook/data/nav.json',
      '_systembook/data/pages/components/actions/button.json',
      '_systembook/data/pages/foundation/color/palette.json',
      '_systembook/data/pages/foundation/color/tokens.json',
      '_systembook/data/previews.json',
      '_systembook/data/routes.json',
      '_systembook/data/search.json',
      '_systembook/data/settings.json',
      '_systembook/data/tokens.json',
    ]);

    // Título e descrição por rota (subtítulo, ou 1º parágrafo), com escape.
    expect(head(files.get('index.html')!)).toEqual({
      title: 'Bem-vindo · Acme DS',
      description: 'A documentação do Acme DS. Comece pela paleta.',
    });
    expect(head(files.get('foundation/color/palette/index.html')!)).toEqual({
      title: 'Palette · Acme DS',
      description: 'As cores base do sistema.',
    });
    expect(head(files.get('foundation/color/tokens/usage/index.html')!)).toEqual({
      title: 'Uso · Tokens · Acme DS',
      description: 'Cores &amp; &quot;contraste&quot; &lt;tema&gt;',
    });
    expect(head(files.get('components/actions/button/index.html')!).description).toBe('Botões disparam ações.');
    expect(head(files.get('404.html')!).title).toBe('Page not found · Acme DS');

    // Todo asset referenciado pelo HTML está sob a base e existe.
    for (const file of html) {
      const refs = [...files.get(file)!.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
      expect(refs.length, file).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(ref.startsWith('/acme-ds/_systembook/assets/'), `${file}: ${ref}`).toBe(true);
        expect(files.has(ref.slice('/acme-ds/'.length)), ref).toBe(true);
      }
    }
    // Os links entre páginas nos dados também levam a base.
    expect(files.get('_systembook/data/landing.json')).toContain('"href":"/acme-ds/foundation/color/palette"');

    // Previews (SYS-100): artefato sob a base, assets absolutos, e o mapa nos dados.
    const previews = JSON.parse(files.get('_systembook/data/previews.json')!);
    expect(Object.keys(previews)).toEqual(['Button/disabled', 'Button/primary']);
    expect(previews['Button/primary'].url).toBe('/acme-ds/_systembook/previews/button--primary/index.html');
    expect(previews['Button/primary'].config.component).toBe('Button');
    const previewHtml = files.get('_systembook/previews/button--primary/index.html')!;
    for (const ref of [...previewHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!)) {
      expect(ref.startsWith('/acme-ds/_systembook/previews/assets/'), ref).toBe(true);
      expect(files.has(ref.slice('/acme-ds/'.length)), ref).toBe(true);
    }
    expect(files.get('_headers')).toBe('/_systembook/previews/*\n  Access-Control-Allow-Origin: *\n');
    expect(JSON.parse(files.get('serve.json')!).headers[0].source).toBe('_systembook/previews/**');

    // Imagens e logo copiados com hash no nome, com o src/url reescrito.
    const media = [...files.keys()].filter((f) => f.startsWith('_systembook/media/')).sort();
    expect(media.map((f) => f.replace(/-[0-9a-f]{8}\./, '-#.'))).toEqual([
      '_systembook/media/dont-#.png',
      '_systembook/media/logo-#.svg',
      '_systembook/media/palette-#.png',
    ]);
    const settings = JSON.parse(files.get('_systembook/data/settings.json')!);
    expect(settings).toEqual({
      nomeDesignSystem: 'Acme DS',
      logoUrl: `/acme-ds/${media[1]}`,
      logoDarkUrl: null,
      locales: [{ code: 'en', label: 'English' }],
      defaultLocale: 'en',
    });
    expect(files.get('_systembook/data/pages/foundation/color/palette.json')).toContain(`"src":"/acme-ds/${media[2]}"`);
    expect(files.get('_systembook/data/pages/components/actions/button.json')).toContain(`"src":"/acme-ds/${media[0]}"`);
  });

  it('referências quebradas: imagem, par de preview e logo — todas com posição, sem gerar nada', async () => {
    const config = await fixtureConfig('/');
    const button = path.join(config.contentDir, 'components/actions/button.mdx');
    writeFileSync(
      button,
      readFileSync(button, 'utf8') +
        '\n![x](./nao-existe.png)\n\n<ComponentEmbed component="Button" variant="ghost" />\n\n<ComponentEmbed component="Card" variant="x" />\n',
    );
    const result = await buildStaticSite({ ...config, logo: './brand/sumiu.svg' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems).toEqual([
      'systembook.config.ts: "logo": arquivo não encontrado (./brand/sumiu.svg).',
      'docs/components/actions/button.mdx:17:1  imagem "./nao-existe.png" não encontrada.',
      'docs/components/actions/button.mdx:19:1  variante "ghost" de "Button" não existe nos *.preview.tsx — variantes: primary, disabled.',
      'docs/components/actions/button.mdx:21:1  componente "Card" não tem *.preview.tsx — componentes com preview: Button.',
    ]);
    expect(() => readdirSync(config.outDir)).toThrow();
  });

  it('imagem que é pasta, logo fora do projeto e previews com o mesmo nome de artefato', async () => {
    const config = await fixtureConfig('/');
    const button = path.join(config.contentDir, 'components/actions/button.mdx');
    writeFileSync(button, readFileSync(button, 'utf8') + '\n![x](../../foundation/color/img)\n');
    writeFileSync(
      path.join(config.root, 'src/outro.preview.tsx'),
      "export function Preview() { return null; }\nexport default { component: 'button', variants: [{ id: 'Primary', label: 'P', props: {} }], controls: [] };\n",
    );
    const result = await buildStaticSite({ ...config, logo: '../fora.svg' });
    expect(!result.ok && result.problems).toEqual([
      'src/outro.preview.tsx  "button" / "Primary" gera o mesmo preview (button--primary) que src/button.preview.tsx — renomeie o componente ou a variante.',
      'systembook.config.ts: "logo": o arquivo precisa estar dentro do projeto (../fora.svg).',
      'docs/components/actions/button.mdx:17:1  imagem "../../foundation/color/img" não encontrada.',
    ]);
  });

  it('com previews: false, embeds não são conferidos e nada de preview é gerado', async () => {
    const config = await fixtureConfig('/');
    const button = path.join(config.contentDir, 'components/actions/button.mdx');
    writeFileSync(button, readFileSync(button, 'utf8') + '\n<ComponentEmbed component="Card" variant="x" />\n');
    const result = await buildStaticSite({ ...config, previews: false });
    expect(result.ok).toBe(true);
    const files = tree(config.outDir);
    expect([...files.keys()].some((f) => f.startsWith('_systembook/previews/'))).toBe(false);
    expect(files.has('_headers')).toBe(false);
    expect(files.get('_systembook/data/previews.json')).toBe('{}\n');
  });

  it('na raiz, e a mesma entrada gera os mesmos bytes', async () => {
    const a = await fixtureConfig('/');
    const b = await fixtureConfig('/');
    await buildStaticSite(a);
    await buildStaticSite(b);
    const filesA = tree(a.outDir);
    expect(filesA.get('index.html')).toMatch(/src="\/_systembook\/assets\/index-[\w-]+\.js"/);
    expect(filesA.get('_systembook/data/landing.json')).toContain('"href":"/foundation/color/palette"');
    const filesB = tree(b.outDir);
    const differing = [...new Set([...filesA.keys(), ...filesB.keys()])].filter((k) => filesA.get(k) !== filesB.get(k));
    expect(differing).toEqual([]);
  });

  it('erro de conteúdo: lista todos com o caminho a partir da raiz, sem gerar nada', async () => {
    const root = mkdtempSync(path.join(TMP, 'proj-'));
    temps.push(root);
    mkdirSync(path.join(root, 'docs/m/s'), { recursive: true });
    writeFileSync(path.join(root, 'systembook.config.json'), '{ "name": "X" }');
    writeFileSync(path.join(root, 'docs/m/s/p.mdx'), '---\ntitle: P\n---\n\n#### fundo\n\n<Badge />\n');
    const config = await loadConfig(root);
    const result = await buildStaticSite(config);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((p) => p.split('  ')[0])).toEqual(['docs/m/s/p.mdx:5:1', 'docs/m/s/p.mdx:7:1']);
    expect(() => readdirSync(config.outDir)).toThrow();
  });

  it('tokens: erro falha o build sem gerar nada; aviso não', async () => {
    const config = await fixtureConfig('/');
    mkdirSync(path.join(config.root, 'tokens'));
    const write = (tokens: unknown) => writeFileSync(path.join(config.root, 'tokens/color.json'), JSON.stringify(tokens));

    write({ ok: { $type: 'color', $value: '#fff' }, bad: { $type: 'color', $value: 'nope' } });
    const failed = await buildStaticSite({ ...config, tokens: { files: ['tokens/*.json'], modes: [] } });
    expect(!failed.ok && failed.problems).toEqual([
      'tokens/color.json  bad: "nope" não é uma cor ("#0a84ff", "rgb(…)", um nome CSS ou { colorSpace, components }).',
    ]);
    expect(() => readdirSync(config.outDir)).toThrow();

    write({ ok: { $type: 'color', $value: '#fff', $foo: 1 } });
    const built = await buildStaticSite({ ...config, tokens: { files: ['tokens/*.json'], modes: [] } });
    expect(built).toMatchObject({ ok: true, warnings: ['tokens/color.json  ok: propriedade "$foo" não suportada; ignorada.'] });

    expect(JSON.parse(tree(config.outDir).get('_systembook/data/tokens.json')!)).toMatchObject({
      modes: ['default'],
      tokens: [{ path: 'ok', type: 'color' }],
    });
    // Com tokens, a página Tokens gerada (SYS-140) vira rota; sem eles (primeiro teste), não.
    expect(built).toMatchObject({ routes: 6 });
    expect(tree(config.outDir).has('tokens/index.html')).toBe(true);

    // Com modos: os valores de cada modo vão para o site.
    mkdirSync(path.join(config.root, 'modes'));
    writeFileSync(path.join(config.root, 'modes/light.json'), JSON.stringify({ text: { $type: 'color', $value: '#111' } }));
    writeFileSync(path.join(config.root, 'modes/dark.json'), JSON.stringify({ text: { $type: 'color', $value: '#eee' } }));
    const modes = [
      { name: 'light', files: ['modes/light.json'] },
      { name: 'dark', files: ['modes/dark.json'] },
    ];
    write({ fg: { $type: 'color', $value: '{text}' } });
    expect(await buildStaticSite({ ...config, tokens: { files: ['tokens/*.json'], modes } })).toMatchObject({ ok: true });
    const site = JSON.parse(tree(config.outDir).get('_systembook/data/tokens.json')!);
    expect(site.modes).toEqual(['light', 'dark']);
    const fg = site.tokens.find((t: { path: string }) => t.path === 'fg');
    expect([fg.byMode.light.resolvedValue, fg.byMode.dark.resolvedValue]).toEqual(['#111', '#eee']);

    const missing = await buildStaticSite({ ...config, tokens: { files: [], modes: [{ name: 'dark', files: ['dark/*.json'] }] } });
    expect(!missing.ok && missing.problems).toEqual(['systembook.config.ts: "tokens.modes.dark": "dark/*.json" não casa com nenhum arquivo.']);
  });

  it('recusa outDir que apagaria o projeto ou o conteúdo', async () => {
    const config = await loadConfig(FIXTURE);
    for (const outDir of [
      config.root,
      path.dirname(config.root),
      path.join(path.dirname(config.root), 'vizinho'),
      config.contentDir,
      path.join(config.contentDir, 'out'),
      path.join(config.root, '.git'),
      path.join(config.root, 'node_modules', 'x'),
    ]) {
      const result = await buildStaticSite({ ...config, outDir });
      expect(result.ok, outDir).toBe(false);
      expect(!result.ok && result.problems[0]).toContain('"outDir"');
    }
  });
});

describe('systembook build — idiomas (SYS-187)', { timeout: 60_000 }, () => {
  /** A fixture com uma tradução pt-BR parcial em `docs-pt-br/`. */
  async function multilingual(files: Record<string, string | Buffer> = PT_FILES): Promise<ResolvedConfig> {
    const config = await fixtureConfig('/acme-ds/');
    const dir = path.join(config.root, 'docs-pt-br');
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), content);
    }
    return {
      ...config,
      locales: {
        default: { code: 'en', label: 'English' },
        translations: [{ code: 'pt-BR', label: 'Português', dir }],
      },
    };
  }
  const PT_FILES: Record<string, string | Buffer> = {
    'index.mdx': '---\ntitle: Boas-vindas\n---\n\nA documentação em português.\n',
    'foundation/_menu.yml': 'title: Fundamentos\nslug: fundamentos\n',
    'foundation/color/_section.yml': 'title: Cor\nslug: cor\n',
    'foundation/color/palette.mdx':
      '---\ntitle: Paleta\nslug: paleta\nsubtitle: As cores, em português.\n---\n\n![Paleta](./img/palette.png)\n\n![Traduzida](./img/paleta.png)\n\nVeja os [tokens](./tokens/index.mdx).\n',
    'foundation/color/img/paleta.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  };
  const lang = (html: string) => /<html lang="([^"]*)">/.exec(html)?.[1];
  const links = (html: string) => [...html.matchAll(/<link rel="(alternate|canonical)"(?: hreflang="([^"]*)")? href="([^"]*)" \/>/g)].map((m) => [m[1], m[2] ?? null, m[3]]);

  it('um HTML por rota de cada idioma, com lang, hreflang e canonical', async () => {
    const config = await multilingual();
    const result = await buildStaticSite(config);
    expect(result).toEqual({ ok: true, outDir: config.outDir, routes: 10, warnings: [] });
    const files = tree(config.outDir);

    expect([...files.keys()].filter((f) => f.startsWith('pt-br/')).sort()).toEqual([
      'pt-br/components/actions/button/index.html',
      'pt-br/fundamentos/cor/paleta/index.html',
      'pt-br/fundamentos/cor/tokens/index.html',
      'pt-br/fundamentos/cor/tokens/usage/index.html',
      'pt-br/index.html',
    ]);
    expect(lang(files.get('index.html')!)).toBe('en');
    expect(lang(files.get('pt-br/index.html')!)).toBe('pt-BR');
    expect(lang(files.get('404.html')!)).toBe('en');
    expect(head(files.get('pt-br/index.html')!)).toEqual({ title: 'Boas-vindas · Acme DS', description: 'A documentação em português.' });

    // página traduzida: um alternate por idioma e x-default, nos dois idiomas
    const alternates = [
      ['alternate', 'en', '/acme-ds/foundation/color/palette'],
      ['alternate', 'pt-BR', '/acme-ds/pt-br/fundamentos/cor/paleta'],
      ['alternate', 'x-default', '/acme-ds/foundation/color/palette'],
    ];
    expect(links(files.get('foundation/color/palette/index.html')!)).toEqual(alternates);
    expect(links(files.get('pt-br/fundamentos/cor/paleta/index.html')!)).toEqual(alternates);
    expect(head(files.get('pt-br/fundamentos/cor/paleta/index.html')!).title).toBe('Paleta · Acme DS');
    // fallback: só o canonical para a original, com a mesma tab
    expect(links(files.get('pt-br/fundamentos/cor/tokens/index.html')!)).toEqual([['canonical', null, '/acme-ds/foundation/color/tokens']]);
    expect(links(files.get('pt-br/fundamentos/cor/tokens/usage/index.html')!)).toEqual([
      ['canonical', null, '/acme-ds/foundation/color/tokens/usage'],
    ]);
    // página só no padrão, home e 404: nada
    expect(links(files.get('foundation/color/tokens/index.html')!)).toEqual([]);
    expect(links(files.get('pt-br/index.html')!)).toEqual([]);
    expect(links(files.get('404.html')!)).toEqual([]);
  });

  it('dados e routes.json por idioma; imagens da tradução com fallback para as do padrão', async () => {
    const config = await multilingual();
    await buildStaticSite(config);
    const files = tree(config.outDir);
    const json = (file: string) => JSON.parse(files.get(`_systembook/data/${file}`)!);

    expect(json('settings.json').locales).toEqual([
      { code: 'en', label: 'English' },
      { code: 'pt-BR', label: 'Português' },
    ]);
    expect(json('locales/pt-br/nav.json').map((m: { slug: string }) => m.slug)).toEqual(['components', 'fundamentos']);
    const routes = json('routes.json') as { path: string; locale: string }[];
    expect(routes.filter((r) => r.locale === 'pt-BR').map((r) => r.path)).toContain('/pt-br/fundamentos/cor/paleta');
    expect(routes.find((r) => r.path === '')!.locale).toBe('en');

    const enPalette = JSON.stringify(json('pages/foundation/color/palette.json'));
    const ptPalette = JSON.stringify(json('locales/pt-br/pages/fundamentos/cor/paleta.json'));
    const media = (text: string) => [...text.matchAll(/\/acme-ds\/_systembook\/media\/[\w.-]+/g)].map((m) => m[0]);
    const [shared, translated] = media(ptPalette);
    expect(media(enPalette)).toContain(shared); // a mesma imagem do padrão
    expect(translated).toMatch(/\/paleta-[0-9a-f]{8}\.png$/);
    expect(files.has(translated!.replace('/acme-ds/', ''))).toBe(true);
    expect(ptPalette).toContain('"href":"/acme-ds/pt-br/fundamentos/cor/tokens"');
  });

  it('erros da tradução com o caminho da pasta do idioma; menu com o slug do prefixo', async () => {
    const config = await multilingual({
      'foundation/color/palette.mdx': '---\ntitle: Paleta\n---\n\n![x](./img/nao-existe.png)\n',
      'foundation/orfa.mdx': '---\ntitle: Órfã\n---\n',
    });
    mkdirSync(path.join(config.root, 'docs/pt-br/s'), { recursive: true });
    writeFileSync(path.join(config.root, 'docs/pt-br/s/p.mdx'), '---\ntitle: P\n---\n\nX\n');
    const result = await buildStaticSite(config);
    expect(result.ok).toBe(false);
    const problems = !result.ok ? result.problems : [];
    expect(problems.some((p) => p.startsWith('docs/pt-br/: o menu "pt-br" tem o mesmo endereço que o prefixo do idioma "pt-BR"'))).toBe(true);
    expect(problems.map((p) => p.split('  ')[0]!).filter((p) => p.startsWith('docs-pt-br/'))).toEqual([
      'docs-pt-br/foundation/color/palette.mdx:5:1',
      'docs-pt-br/foundation/orfa.mdx:1:1',
    ]);
  });

  it('sem a pasta do idioma: aviso, e o idioma sai inteiro no padrão', async () => {
    const config = await multilingual({});
    rmSync(path.join(config.root, 'docs-pt-br'), { recursive: true, force: true });
    const result = await buildStaticSite(config);
    expect(result.ok && result.warnings).toEqual(['docs-pt-br: pasta de "pt-BR" não encontrada — o idioma sai inteiro no idioma padrão.']);
    const files = tree(config.outDir);
    expect(links(files.get('pt-br/foundation/color/palette/index.html')!)).toEqual([['canonical', null, '/acme-ds/foundation/color/palette']]);
  });

  it('com um idioma, nada de idioma no HTML nem no routes.json', async () => {
    const config = await fixtureConfig('/acme-ds/');
    await buildStaticSite(config);
    const files = tree(config.outDir);
    expect(lang(files.get('foundation/color/palette/index.html')!)).toBe('en');
    expect(links(files.get('foundation/color/palette/index.html')!)).toEqual([]);
    expect(files.get('_systembook/data/routes.json')).not.toContain('"locale"');
    expect([...files.keys()].some((f) => f.includes('locales/'))).toBe(false);
  });
});
