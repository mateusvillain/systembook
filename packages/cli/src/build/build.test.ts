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
    expect(settings).toEqual({ nomeDesignSystem: 'Acme DS', logoUrl: `/acme-ds/${media[1]}`, logoDarkUrl: null });
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
