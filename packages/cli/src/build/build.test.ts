import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** Config do fixture com `outDir` temporário e a base dada. */
async function fixtureConfig(base: string): Promise<ResolvedConfig> {
  const outDir = mkdtempSync(path.join(TMP, 'dist-'));
  temps.push(outDir);
  return { ...(await loadConfig(FIXTURE)), base, outDir };
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
    expect(result).toEqual({ ok: true, outDir: config.outDir, routes: 5 });

    const files = tree(config.outDir);
    const html = [...files.keys()].filter((f) => f.endsWith('.html')).sort();
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
      '_systembook/data/heads.json',
      '_systembook/data/landing.json',
      '_systembook/data/nav.json',
      '_systembook/data/pages/components/actions/button.json',
      '_systembook/data/pages/foundation/color/palette.json',
      '_systembook/data/pages/foundation/color/tokens.json',
      '_systembook/data/previews.json',
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
  });

  it('na raiz, e a mesma entrada gera os mesmos bytes', async () => {
    const a = await fixtureConfig('/');
    const b = await fixtureConfig('/');
    await buildStaticSite(a);
    await buildStaticSite(b);
    const filesA = tree(a.outDir);
    expect(filesA.get('index.html')).toMatch(/src="\/_systembook\/assets\/index-[\w-]+\.js"/);
    expect(filesA.get('_systembook/data/landing.json')).toContain('"href":"/foundation/color/palette"');
    expect([...filesA]).toEqual([...tree(b.outDir)]);
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

  it('recusa outDir que apagaria o projeto ou o conteúdo', async () => {
    const config = await loadConfig(FIXTURE);
    for (const outDir of [config.root, path.dirname(config.root), config.contentDir, path.join(config.contentDir, 'out')]) {
      const result = await buildStaticSite({ ...config, outDir });
      expect(result.ok, outDir).toBe(false);
      expect(!result.ok && result.problems[0]).toContain('"outDir"');
    }
  });
});
