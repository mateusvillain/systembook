import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildStaticSite } from './build/index.js';
import { checkSite } from './check.js';
import { loadConfig, withBase } from './config.js';
import { initProject, INIT_SCRIPTS, PAGES_WORKFLOW } from './init.js';

const TMP = fileURLToPath(new URL('../.tmp', import.meta.url));
mkdirSync(TMP, { recursive: true });
const temps: string[] = [];
afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(TMP, 'init-'));
  temps.push(root);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
}

const read = (root: string, file: string) => readFileSync(path.join(root, file), 'utf8');
const pkgOf = (root: string) => JSON.parse(read(root, 'package.json')) as Record<string, Record<string, string>>;

describe('systembook init', { timeout: 60_000 }, () => {
  it('repo vazio: cria tudo, e o resultado passa no check e no build', async () => {
    const root = project();
    const { steps, packageManager } = await initProject(root);
    expect(packageManager).toBe('npm');
    expect(steps.map((s) => [s.file, s.status])).toEqual([
      ['systembook.config.ts', 'criado'],
      ['docs/index.mdx', 'criado'],
      ['docs/guide/basics/introduction.mdx', 'criado'],
      ['package.json', 'criado'],
      ['.gitignore', 'criado'],
    ]);
    expect(existsSync(path.join(root, PAGES_WORKFLOW))).toBe(false);

    const pkg = pkgOf(root);
    expect(pkg.scripts).toEqual(INIT_SCRIPTS);
    expect(pkg.devDependencies!['@systembook/cli']).toMatch(/^\^\d+\.\d+\.\d+/);
    expect(read(root, '.gitignore')).toBe('# SystemBook\nsystembook-dist/\n.systembook/\n');

    const config = await loadConfig(root);
    expect(config.name).toBe(path.basename(root).split(/[-_]/).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' '));
    expect(await checkSite(config)).toMatchObject({ ok: true, pages: 1 });
    expect(await buildStaticSite(config)).toMatchObject({ ok: true, routes: 2 });
  });

  it('repo existente: não sobrescreve sem confirmação e só complementa package.json e .gitignore', async () => {
    const original = { name: '@acme/ui-kit', scripts: { 'docs:dev': 'storybook dev', test: 'vitest' } };
    const root = project({
      'package.json': `${JSON.stringify(original, null, 4)}\n`,
      'pnpm-lock.yaml': '',
      '.gitignore': 'node_modules\n/systembook-dist',
      'docs/index.mdx': '# Minha landing\n',
    });

    const asked: string[] = [];
    const { steps, packageManager } = await initProject(root, {
      confirm: async (file) => {
        asked.push(file);
        return false;
      },
    });
    expect(packageManager).toBe('pnpm');
    expect(asked).toEqual(['docs/index.mdx']);
    expect(read(root, 'docs/index.mdx')).toBe('# Minha landing\n');
    expect(steps.find((s) => s.file === 'docs/index.mdx')).toMatchObject({ status: 'mantido' });
    expect(read(root, 'systembook.config.ts')).toContain('name: "Ui Kit"');

    // Script com o mesmo nome e outro comando fica; o resto entra; a indentação é a do arquivo.
    const pkg = pkgOf(root);
    expect(pkg.scripts).toEqual({ ...original.scripts, 'docs:check': 'systembook check', 'docs:build': 'systembook build' });
    expect(read(root, 'package.json')).toMatch(/^\{\n {4}"name"/);
    expect(steps.find((s) => s.file === 'package.json')!.note).toContain('mantidos: docs:dev');
    // `/systembook-dist` já cobre o site; só falta a pasta dos previews.
    expect(read(root, '.gitignore')).toBe('node_modules\n/systembook-dist\n\n# SystemBook\n.systembook/\n');

    // Rodar de novo não duplica nada; com confirmação, sobrescreve.
    const again = await initProject(root, { confirm: async () => true });
    expect(again.steps.map((s) => [s.file, s.status])).toEqual([
      ['systembook.config.ts', 'sobrescrito'],
      ['docs/index.mdx', 'sobrescrito'],
      ['docs/guide/basics/introduction.mdx', 'sobrescrito'],
      ['package.json', 'mantido'],
      ['.gitignore', 'mantido'],
    ]);
    expect(read(root, 'docs/index.mdx')).toContain('# Bem-vindo');
  });

  it('config em outro formato conta como existente; force sobrescreve sem perguntar', async () => {
    const root = project({ 'systembook.config.json': '{ "name": "X" }', 'docs/index.mdx': '# X\n' });
    const { steps } = await initProject(root, { force: true, confirm: () => Promise.reject(new Error('não pergunta')) });
    expect(steps[0]).toEqual({ file: 'systembook.config.ts', status: 'mantido', note: 'já existe systembook.config.json' });
    expect(existsSync(path.join(root, 'systembook.config.ts'))).toBe(false);
    expect(steps[1]).toEqual({ file: 'docs/index.mdx', status: 'sobrescrito' });
  });

  it('workflow do GitHub Pages com os comandos do gerenciador do projeto', async () => {
    const pnpm = project({ 'package.json': '{"packageManager":"pnpm@10.0.0"}' });
    await initProject(pnpm, { githubPages: true });
    const workflow = read(pnpm, PAGES_WORKFLOW);
    expect(workflow).toContain('uses: pnpm/action-setup@v4\n      - uses: actions/setup-node@v4');
    expect(workflow).toContain('cache: pnpm');
    expect(workflow).toContain('run: pnpm install --frozen-lockfile');
    expect(workflow).toContain('run: pnpm exec systembook build --base "${{ steps.pages.outputs.base_path }}/"');
    expect(workflow).toContain('path: systembook-dist');

    const npm = project({ 'package-lock.json': '{}' });
    await initProject(npm, { githubPages: true });
    expect(read(npm, PAGES_WORKFLOW)).toContain('run: npm ci');
    expect(read(npm, PAGES_WORKFLOW)).toContain('run: npx systembook build --base');
    expect(read(npm, PAGES_WORKFLOW)).not.toContain('pnpm');

    const berry = project({ 'yarn.lock': '', '.yarnrc.yml': '' });
    await initProject(berry, { githubPages: true });
    expect(read(berry, PAGES_WORKFLOW)).toContain('run: corepack enable');
    expect(read(berry, PAGES_WORKFLOW)).toContain('run: yarn install --immutable');
  });
});

describe('withBase', () => {
  it('normaliza a base vinda do CI', async () => {
    const root = project();
    await initProject(root);
    const config = await loadConfig(root);
    expect(withBase(config, '/').base).toBe('/');
    expect(withBase(config, '/meu-repo').base).toBe('/meu-repo/');
    expect(withBase(config, '/meu-repo//').base).toBe('/meu-repo/');
    expect(() => withBase(config, 'meu-repo')).toThrow('--base: precisa começar com "/"');
  });
});
