import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { buildStaticSite } from './build/index.js';
import { checkSite } from './check.js';
import { loadConfig, withBase } from './config.js';
import { initProject, INIT_SCRIPTS, PAGES_WORKFLOW_FILE as PAGES_WORKFLOW } from './init.js';

const TMP = fileURLToPath(new URL('../.tmp', import.meta.url));
mkdirSync(TMP, { recursive: true });
const temps: string[] = [];
afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/**
 * Projeto temporário num repo git próprio: sem o `.git`, a raiz git seria a do
 * monorepo, e o workflow iria parar no `.github/` dele.
 */
function project(files: Record<string, string> = {}, branch = 'main'): string {
  const root = mkdtempSync(path.join(TMP, 'init-'));
  temps.push(root);
  mkdirSync(path.join(root, '.git'));
  writeFileSync(path.join(root, '.git/HEAD'), `ref: refs/heads/${branch}\n`);
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
    expect(packageManager.name).toBe('npm');
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
    // Peers do CLI que o yarn 1 não instalaria.
    expect(pkg.devDependencies).toMatchObject({ react: '^19.0.0', 'react-dom': '^19.0.0' });
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
    expect(packageManager.name).toBe('pnpm');
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
    const pnpm = project({ 'package.json': '{"packageManager":"pnpm@10.0.0"}', 'pnpm-lock.yaml': '' });
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

    // Sem lockfile: sem `npm ci` e sem cache (que falhariam sem ele).
    const fresh = project();
    await initProject(fresh, { githubPages: true });
    expect(read(fresh, PAGES_WORKFLOW)).toContain('run: npm install\n');
    expect(read(fresh, PAGES_WORKFLOW)).not.toContain('cache:');

    // pnpm sem `packageManager`: a action precisa da versão.
    const loosePnpm = project({ 'pnpm-lock.yaml': '' });
    await initProject(loosePnpm, { githubPages: true });
    expect(read(loosePnpm, PAGES_WORKFLOW)).toContain('uses: pnpm/action-setup@v4\n        with:\n          version: 10');

    // Yarn 4 não cria .yarnrc.yml: vale o packageManager.
    const yarn4 = project({ 'yarn.lock': '', 'package.json': '{"packageManager":"yarn@4.5.0"}' });
    await initProject(yarn4, { githubPages: true });
    expect(read(yarn4, PAGES_WORKFLOW)).toContain('run: yarn install --immutable');

    // O guia de deploy mostra este workflow: ele não pode divergir do que o init gera.
    const guide = readFileSync(fileURLToPath(new URL('../../../docs/deploy-static.md', import.meta.url)), 'utf8');
    const documented = /```yaml\n(name: Docs\n[\s\S]*?)```/.exec(guide)?.[1];
    const generated = read(npm, PAGES_WORKFLOW).slice(read(npm, PAGES_WORKFLOW).indexOf('name: Docs'));
    expect(documented).toBe(generated);

    const berry = project({ 'yarn.lock': '', '.yarnrc.yml': '' });
    await initProject(berry, { githubPages: true });
    expect(read(berry, PAGES_WORKFLOW)).toContain('run: corepack enable');
    expect(read(berry, PAGES_WORKFLOW)).toContain('run: yarn install --immutable');
  });

  it('existente: docs/ com outra documentação, config existente, subpasta do repo e branch', async () => {
    // docs/ já tem outra doc: o conteúdo vai para systembook-docs/, e a config aponta para lá.
    const withDocs = project({ 'docs/ci.md': '# CI\n', 'docs/index.md': '# Docs\n' }, 'master');
    const { steps } = await initProject(withDocs, { githubPages: true });
    expect(steps.filter((s) => s.status === 'criado').map((s) => s.file)).toContain('systembook-docs/index.mdx');
    expect(read(withDocs, 'docs/index.md')).toBe('# Docs\n');
    const config = await loadConfig(withDocs);
    expect(path.relative(withDocs, config.contentDir)).toBe('systembook-docs');
    expect(await checkSite(config)).toMatchObject({ ok: true });
    expect(read(withDocs, PAGES_WORKFLOW)).toContain('branches: [master]');

    // Config existente: o conteúdo segue a contentDir dela, e o workflow publica o outDir dela.
    const configured = project({
      'systembook.config.json': '{ "name": "X", "contentDir": "content", "outDir": "public-docs" }',
      'content/a/b/page.md': '---\ntitle: P\n---\n',
    });
    const kept = await initProject(configured, { githubPages: true });
    expect(kept.steps.filter((s) => s.file.startsWith('content/')).map((s) => s.status)).toEqual(['mantido', 'mantido']);
    expect(read(configured, PAGES_WORKFLOW)).toContain('path: public-docs');

    // Projeto numa subpasta do repo: o workflow vai para a raiz do git e roda na subpasta.
    const repo = project({ 'site/package-lock.json': '{}' });
    const site = path.join(repo, 'site');
    const nested = await initProject(site, { githubPages: true });
    expect(nested.steps.at(-1)).toEqual({ file: `../${PAGES_WORKFLOW}`, status: 'criado' });
    const workflow = read(repo, PAGES_WORKFLOW);
    expect(workflow).toContain('- run: npm ci\n        working-directory: site');
    expect(workflow).toContain('cache-dependency-path: site/package-lock.json');
    expect(workflow).toContain('path: site/systembook-dist');
  });

  it('package.json inválido é erro claro; CRLF e .gitignore vazio são preservados', async () => {
    await expect(initProject(project({ 'package.json': '{ nope' }))).rejects.toThrow('package.json inválido');

    const root = project({ 'package.json': '{\r\n  "name": "x"\r\n}\r\n', '.gitignore': '' });
    await initProject(root);
    expect(read(root, 'package.json')).toMatch(/^\{\r\n {2}"name": "x",\r\n/);
    expect(read(root, '.gitignore')).toBe('# SystemBook\nsystembook-dist/\n.systembook/\n');

    // Negação e padrão com /** contam como presentes.
    const ignored = project({ '.gitignore': '!systembook-dist/\n.systembook/**\n' });
    const { steps } = await initProject(ignored);
    expect(steps.find((s) => s.file === '.gitignore')).toMatchObject({ status: 'mantido' });
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
