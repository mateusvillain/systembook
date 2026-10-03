import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILES, ConfigError, loadConfig } from './config.js';

export interface InitOptions {
  /** Também escreve o workflow de deploy no GitHub Pages. */
  githubPages?: boolean;
  /** Sobrescreve arquivos existentes sem perguntar. */
  force?: boolean;
  /**
   * Pergunta se `file` (relativo à raiz) pode ser sobrescrito. Sem ela (e sem
   * `force`), arquivo existente é mantido.
   */
  confirm?: (file: string) => Promise<boolean>;
}

/** O que aconteceu com cada arquivo. */
export interface InitStep {
  /** Relativo à raiz do projeto (o workflow pode subir até a raiz do git). */
  file: string;
  status: 'criado' | 'sobrescrito' | 'atualizado' | 'mantido';
  /** Por que foi mantido, ou o que mudou num arquivo atualizado. */
  note?: string;
}

export interface InitResult {
  steps: InitStep[];
  packageManager: PackageManager;
}

/** Os scripts que o `init` acrescenta ao `package.json`. */
export const INIT_SCRIPTS = {
  'docs:dev': 'systembook dev',
  'docs:check': 'systembook check',
  'docs:build': 'systembook build',
} as const;

/** O que o `.gitignore` precisa ignorar: o site gerado e as entradas dos previews. */
const GITIGNORE_ENTRIES = ['systembook-dist/', '.systembook/'];

/** Pasta de conteúdo quando `docs/` já guarda outra documentação. */
const FALLBACK_CONTENT_DIR = 'systembook-docs';

export const PAGES_WORKFLOW_FILE = '.github/workflows/systembook-pages.yml';

/** Os arquivos de conteúdo que o `init` escreve, relativos à pasta de conteúdo. */
const CONTENT_FILES = { landing: 'index.mdx', introduction: 'guide/basics/introduction.mdx' };

/**
 * `systembook init` (SYS-107): transforma um repo existente numa doc
 * publicável — config, conteúdo inicial (landing + uma página), scripts no
 * `package.json`, `.gitignore` e, opcionalmente, o workflow do GitHub Pages.
 * O resultado passa no `check` e no `build` sem mexer em nada.
 *
 * Arquivo existente só é sobrescrito com `force` ou com `confirm`; o
 * `package.json` e o `.gitignore` nunca perdem nada, só ganham (script ou
 * linha que já existe fica como está). Uma config que já existe é respeitada:
 * o conteúdo vai para a `contentDir` dela, e o workflow publica o `outDir`
 * dela. Uma pasta de conteúdo que já tem outros `.md`/`.mdx` não recebe as
 * páginas iniciais — elas a deixariam inválida.
 */
export async function initProject(root: string, options: InitOptions = {}): Promise<InitResult> {
  const steps: InitStep[] = [];
  const pkgFile = path.join(root, 'package.json');
  const pkgText = existsSync(pkgFile) ? await readFile(pkgFile, 'utf8') : null;
  const pkg = pkgText === null ? null : parsePackageJson(pkgText);
  const pm = detectPackageManager(root, pkg);

  /** Escreve `file` se não existir, ou se puder sobrescrever. */
  const scaffold = async (file: string, content: string) => {
    const full = path.resolve(root, file);
    const exists = existsSync(full);
    if (exists && !options.force && !(await options.confirm?.(file))) {
      steps.push({ file, status: 'mantido', note: 'já existe' });
      return;
    }
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
    steps.push({ file, status: exists ? 'sobrescrito' : 'criado' });
  };

  // ---- config: a existente manda; senão, uma nova ----
  const existing = CONFIG_FILES.find((name) => existsSync(path.join(root, name)));
  let contentDir = 'docs';
  let outDir = 'systembook-dist';
  if (existing && existing !== 'systembook.config.ts') {
    // Duas configs são erro no `check`: a de outro formato fica, e a .ts não nasce.
    steps.push({ file: 'systembook.config.ts', status: 'mantido', note: `já existe ${existing}` });
  }
  if (existing) {
    const current = await readConfig(root);
    if (current) ({ contentDir, outDir } = current);
  }
  const ownContent = Object.values(CONTENT_FILES);
  const foreign = (dir: string) => markdownFiles(path.join(root, dir)).filter((file) => !ownContent.includes(file));
  if (!existing && foreign(contentDir).length) contentDir = FALLBACK_CONTENT_DIR;
  // Uma .ts existente pode ser sobrescrita (com confirmação); outro formato, não.
  if (!existing || existing === 'systembook.config.ts') {
    await scaffold('systembook.config.ts', configTemplate(projectName(root, pkg), contentDir));
  }

  // ---- conteúdo inicial ----
  const others = foreign(contentDir);
  if (others.length) {
    const note = `${contentDir}/ já tem conteúdo (${others.length} arquivo(s) .md/.mdx)`;
    for (const file of ownContent) steps.push({ file: posix(contentDir, file), status: 'mantido', note });
  } else {
    await scaffold(posix(contentDir, CONTENT_FILES.landing), LANDING);
    await scaffold(posix(contentDir, CONTENT_FILES.introduction), INTRODUCTION);
  }

  steps.push(await updatePackageJson(pkgFile, pkg, pkgText, root));
  steps.push(await updateGitignore(path.join(root, '.gitignore')));

  if (options.githubPages) {
    const repo = gitRoot(root) ?? root;
    const workflow = pagesWorkflow({ pm, pkg, repo, root, outDir, branch: currentBranch(repo) });
    await scaffold(path.relative(root, path.join(repo, PAGES_WORKFLOW_FILE)).split(path.sep).join('/'), workflow);
  }

  return { steps, packageManager: pm };
}

/** A config existente, se carregar; inválida, o `check` mostra o problema depois. */
async function readConfig(root: string): Promise<{ contentDir: string; outDir: string } | null> {
  try {
    const config = await loadConfig(root);
    return {
      contentDir: path.relative(root, config.contentDir) || '.',
      outDir: path.relative(root, config.outDir),
    };
  } catch (error) {
    if (error instanceof ConfigError) return null;
    throw error;
  }
}

const posix = (...parts: string[]) => path.posix.join(...parts.map((p) => p.split(path.sep).join('/')));

/** `.md`/`.mdx` dentro de `dir`, relativos a ele (com `/`). */
function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => /\.mdx?$/i.test(file) && !file.split('/').includes('node_modules'));
}

interface PackageJson {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

function parsePackageJson(text: string): PackageJson {
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as PackageJson;
    throw new Error('não é um objeto');
  } catch (error) {
    throw new Error(`package.json inválido — corrija antes do init: ${(error as Error).message}`, { cause: error });
  }
}

/** Versão deste CLI, para a dependência que o `init` acrescenta. */
function cliVersion(): string {
  const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return own.version;
}

async function updatePackageJson(
  file: string,
  pkg: PackageJson | null,
  text: string | null,
  root: string,
): Promise<InitStep> {
  const next: PackageJson = pkg ? { ...pkg } : { name: path.basename(root), private: true };
  const added: string[] = [];
  const kept: string[] = [];

  const scripts = { ...next.scripts };
  for (const [name, command] of Object.entries(INIT_SCRIPTS)) {
    if (scripts[name] === undefined) {
      scripts[name] = command;
      added.push(name);
    } else if (scripts[name] !== command) {
      kept.push(name);
    }
  }
  next.scripts = scripts;

  // O `init` costuma rodar por `npx`: o CLI ainda não está no projeto. E o
  // react/react-dom são peer dependencies dele, que o yarn 1 não instala.
  const wanted: Record<string, string> = { '@systembook/cli': `^${cliVersion()}`, react: '^19.0.0', 'react-dom': '^19.0.0' };
  for (const [name, range] of Object.entries(wanted)) {
    if (next.dependencies?.[name] || next.devDependencies?.[name]) continue;
    next.devDependencies = { ...next.devDependencies, [name]: range };
    added.push(name);
  }

  if (!added.length) {
    return {
      file: 'package.json',
      status: 'mantido',
      note: kept.length ? `scripts já usados por outro comando: ${kept.join(', ')}` : 'nada a acrescentar',
    };
  }
  // Indentação e fim de linha do arquivo original (2 espaços e LF, se for novo).
  const indent = (text && /^[ \t]+/m.exec(text)?.[0]) || '  ';
  const eol = text?.includes('\r\n') ? '\r\n' : '\n';
  await writeFile(file, `${JSON.stringify(next, null, indent).replace(/\n/g, eol)}${eol}`);
  const note = [`+ ${added.join(', ')}`, kept.length ? `mantidos: ${kept.join(', ')}` : ''].filter(Boolean).join('; ');
  return { file: 'package.json', status: pkg ? 'atualizado' : 'criado', note };
}

/** O padrão de uma linha do `.gitignore`, para comparar `/x`, `x/`, `x/**` e `x`. */
const gitignorePattern = (line: string) =>
  line.trim().replace(/^!/, '').replace(/^\//, '').replace(/\/\*\*$/, '').replace(/\/$/, '');

async function updateGitignore(file: string): Promise<InitStep> {
  const current = existsSync(file) ? await readFile(file, 'utf8') : null;
  // Uma negação (`!x`) também conta: quem escreveu quer o arquivo versionado.
  const present = new Set((current ?? '').split(/\r?\n/).map(gitignorePattern));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !present.has(gitignorePattern(entry)));
  if (!missing.length) return { file: '.gitignore', status: 'mantido', note: 'já ignora o site gerado' };
  const eol = current?.includes('\r\n') ? '\r\n' : '\n';
  const separator = !current ? '' : current.endsWith('\n') ? eol : `${eol}${eol}`;
  await writeFile(file, `${current ?? ''}${separator}${['# SystemBook', ...missing].join(eol)}${eol}`);
  return { file: '.gitignore', status: current === null ? 'criado' : 'atualizado', note: `+ ${missing.join(', ')}` };
}

// ---- gerenciador de pacotes ----

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'yarn-berry';

/** Tudo o que muda por gerenciador: os comandos e os passos do workflow. */
export interface PackageManager {
  name: PackageManagerName;
  /** Lockfile do projeto, relativo à raiz; `null` = ainda não instalado. */
  lockfile: string | null;
  /** Instalar localmente (o próximo passo depois do `init`). */
  install: string;
  /** Instalar no CI: exato pelo lockfile, ou `install` sem ele. */
  ci: string;
  /** Rodar um bin do projeto. */
  exec: string;
  /** Rodar um script do `package.json`. */
  run: string;
  /** Passos do workflow antes do `setup-node`. */
  setupSteps: string[];
  /** Valor do `cache` do `setup-node`. */
  cache: 'npm' | 'pnpm' | 'yarn';
}

const LOCKFILES: Record<string, PackageManagerName> = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
};

export function detectPackageManager(root: string, pkg: Pick<PackageJson, 'packageManager'> | null): PackageManager {
  const lockfile = Object.keys(LOCKFILES).find((file) => existsSync(path.join(root, file))) ?? null;
  const [declared, version = ''] = (pkg?.packageManager ?? '').split('@');
  let name: PackageManagerName = lockfile ? LOCKFILES[lockfile]! : declared === 'pnpm' || declared === 'yarn' ? declared : 'npm';
  if (name === 'yarn') {
    // Yarn 2+ ("berry"): pelo `packageManager` (o Yarn 4 nem cria `.yarnrc.yml`) ou pelo `.yarnrc.yml`.
    const major = declared === 'yarn' ? Number.parseInt(version, 10) : NaN;
    if (major >= 2 || (Number.isNaN(major) && existsSync(path.join(root, '.yarnrc.yml')))) name = 'yarn-berry';
  }
  const pinnedPnpm = declared === 'pnpm';
  switch (name) {
    case 'pnpm':
      return {
        name,
        lockfile,
        install: 'pnpm install',
        ci: lockfile ? 'pnpm install --frozen-lockfile' : 'pnpm install',
        exec: 'pnpm exec',
        run: 'pnpm',
        // Sem `packageManager: pnpm@…`, a action precisa da versão.
        setupSteps: [pinnedPnpm ? '- uses: pnpm/action-setup@v4' : '- uses: pnpm/action-setup@v4\n  with:\n    version: 10'],
        cache: 'pnpm',
      };
    case 'yarn':
      return { name, lockfile, install: 'yarn', ci: lockfile ? 'yarn install --frozen-lockfile' : 'yarn install', exec: 'yarn', run: 'yarn', setupSteps: [], cache: 'yarn' };
    case 'yarn-berry':
      return { name, lockfile, install: 'yarn', ci: lockfile ? 'yarn install --immutable' : 'yarn install', exec: 'yarn', run: 'yarn', setupSteps: ['- run: corepack enable'], cache: 'yarn' };
    case 'npm':
      return { name, lockfile, install: 'npm install', ci: lockfile ? 'npm ci' : 'npm install', exec: 'npx', run: 'npm run', setupSteps: [], cache: 'npm' };
  }
}

// ---- git ----

/** A raiz do repositório git que contém `dir` (onde o GitHub lê `.github/`). */
function gitRoot(dir: string): string | null {
  for (let current = dir; ; current = path.dirname(current)) {
    if (existsSync(path.join(current, '.git'))) return current;
    if (path.dirname(current) === current) return null;
  }
}

/** A branch atual (a que o workflow publica); `main` sem git ou em detached HEAD. */
function currentBranch(repo: string): string {
  try {
    const head = readFileSync(path.join(repo, '.git', 'HEAD'), 'utf8');
    return /^ref: refs\/heads\/(.+)$/m.exec(head)?.[1]?.trim() || 'main';
  } catch {
    return 'main';
  }
}

// ---- templates ----

/** Nome do design system: o do `package.json` (sem escopo) ou o da pasta, legível. */
function projectName(root: string, pkg: PackageJson | null): string {
  const raw = (pkg?.name ?? path.basename(root)).replace(/^@[^/]+\//, '');
  const words = raw.split(/[-_.\s]+/).filter(Boolean);
  if (!words.length) return 'Design System';
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');
}

function configTemplate(name: string, contentDir: string): string {
  const content =
    contentDir === 'docs'
      ? `  // contentDir: 'docs',`
      : `  // \`docs/\` já guarda outra documentação; o conteúdo do SystemBook fica aqui.\n  contentDir: ${JSON.stringify(contentDir)},`;
  return `import type { SystemBookConfig } from '@systembook/cli';

// Formato completo: https://github.com/mateusvillain/systembook/blob/main/docs/static-format.md
export default {
  name: ${JSON.stringify(name)},
  // logo: './brand/logo.svg',
${content}
  // outDir: 'systembook-dist',
  // base: '/', // num site de projeto do GitHub Pages, o workflow passa --base
  statusTags: [
    { titulo: 'Stable', cor: '#2e7d32' },
    { titulo: 'Beta', cor: '#ed6c02' },
  ],
} satisfies SystemBookConfig;
`;
}

const LANDING = `---
title: Início
---

# Bem-vindo

Esta é a página inicial da documentação. Comece pela [introdução](guide/basics/introduction.mdx).
`;

const INTRODUCTION = `---
title: Introdução
subtitle: Uma página de exemplo para você editar ou apagar.
---

## Como a documentação é organizada

As pastas da pasta de conteúdo viram a navegação:

- \`guide/\` é um **menu** (no topo do site);
- \`guide/basics/\` é uma **seção** (na barra lateral);
- \`guide/basics/introduction.mdx\` é esta **página**.

Para criar uma página com tabs, troque o arquivo por uma pasta com um \`index.mdx\` (o Overview) e um arquivo por tab.

<Callout variant="tip">
  Rode \`systembook dev\` e edite este arquivo: o navegador recarrega ao salvar.
</Callout>

## Previews de componente

Crie um \`*.preview.tsx\` ao lado do componente e mostre-o aqui com \`<ComponentEmbed component="Button" variant="primary" />\`.
`;

interface WorkflowOptions {
  pm: PackageManager;
  pkg: PackageJson | null;
  /** Raiz do git, onde o workflow mora e de onde os passos partem. */
  repo: string;
  /** Raiz do projeto (a config), talvez numa subpasta do repo. */
  root: string;
  outDir: string;
  branch: string;
}

function pagesWorkflow({ pm, repo, root, outDir, branch }: WorkflowOptions): string {
  const project = path.relative(repo, root).split(path.sep).join('/');
  const inProject = project ? `        working-directory: ${project}\n` : '';
  const lockfile = pm.lockfile ? posix(project, pm.lockfile) : null;
  const indent = (block: string) => block.split('\n').map((line) => `      ${line}`).join('\n');
  const setup = pm.setupSteps.map((step) => `${indent(step)}\n`).join('');
  // Sem lockfile, o cache do setup-node falha: ele é a chave do cache.
  const cache = lockfile
    ? `        with:\n          node-version: 22\n          cache: ${pm.cache}\n${project ? `          cache-dependency-path: ${lockfile}\n` : ''}`
    : '        with:\n          node-version: 22\n';
  return `# Publica a documentação no GitHub Pages a cada push na branch ${branch}.
# No repositório: Settings → Pages → Source: "GitHub Actions".
name: Docs

on:
  push:
    branches: [${branch}]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Um deploy por vez; um push novo não cancela o que já está publicando.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
${setup}      - uses: actions/setup-node@v4
${cache}      - run: ${pm.ci}
${inProject}      - id: pages
        uses: actions/configure-pages@v5
      # Site de projeto fica em /<repo>/: o base_path vem do próprio Pages.
      - run: ${pm.exec} systembook build --base "\${{ steps.pages.outputs.base_path }}/"
${inProject}      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${posix(project, outDir)}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;
}
