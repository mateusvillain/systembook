import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILES } from './config.js';

/** Gerenciador de pacotes do projeto, pelo lockfile (ou pelo `packageManager`). */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'yarn-berry';

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
const IGNORED = ['systembook-dist/', '.systembook/'];

export const PAGES_WORKFLOW = '.github/workflows/systembook-pages.yml';

/**
 * `systembook init` (SYS-107): transforma um repo existente numa doc
 * publicável — config, conteúdo inicial (landing + uma página), scripts no
 * `package.json`, `.gitignore` e, opcionalmente, o workflow do GitHub Pages.
 * O resultado passa no `check` e no `build` sem mexer em nada.
 *
 * Arquivo existente só é sobrescrito com `force` ou com `confirm`; o
 * `package.json` e o `.gitignore` nunca são substituídos, só complementados
 * (script ou linha que já existe fica como está).
 */
export async function initProject(root: string, options: InitOptions = {}): Promise<InitResult> {
  const steps: InitStep[] = [];
  const pkgFile = path.join(root, 'package.json');
  const pkg = existsSync(pkgFile) ? (JSON.parse(await readFile(pkgFile, 'utf8')) as PackageJson) : null;
  const packageManager = detectPackageManager(root, pkg);

  /** Escreve `file` se não existir, ou se puder sobrescrever. */
  const scaffold = async (file: string, content: string) => {
    const full = path.join(root, file);
    const exists = existsSync(full);
    if (exists && !options.force && !(await options.confirm?.(file))) {
      steps.push({ file, status: 'mantido', note: 'já existe' });
      return;
    }
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
    steps.push({ file, status: exists ? 'sobrescrito' : 'criado' });
  };

  // Uma config em outro formato também conta: duas configs são erro no `check`.
  const otherConfig = CONFIG_FILES.find((name) => name !== 'systembook.config.ts' && existsSync(path.join(root, name)));
  if (otherConfig) steps.push({ file: 'systembook.config.ts', status: 'mantido', note: `já existe ${otherConfig}` });
  else await scaffold('systembook.config.ts', configTemplate(projectName(root, pkg)));

  await scaffold('docs/index.mdx', LANDING);
  await scaffold('docs/guide/basics/introduction.mdx', INTRODUCTION);
  steps.push(await updatePackageJson(pkgFile, pkg, root));
  steps.push(await updateGitignore(path.join(root, '.gitignore')));
  if (options.githubPages) await scaffold(PAGES_WORKFLOW, pagesWorkflow(packageManager, pkg));

  return { steps, packageManager };
}

interface PackageJson {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

/** Versão deste CLI, para a dependência que o `init` acrescenta. */
function cliVersion(): string {
  const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return own.version;
}

async function updatePackageJson(file: string, pkg: PackageJson | null, root: string): Promise<InitStep> {
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

  // O `init` costuma rodar por `npx`: o CLI ainda não está no projeto.
  if (!next.dependencies?.['@systembook/cli'] && !next.devDependencies?.['@systembook/cli']) {
    next.devDependencies = { ...next.devDependencies, '@systembook/cli': `^${cliVersion()}` };
    added.push('@systembook/cli');
  }

  if (!added.length) {
    return {
      file: 'package.json',
      status: 'mantido',
      note: kept.length ? `scripts já usados por outro comando: ${kept.join(', ')}` : 'nada a acrescentar',
    };
  }
  // A indentação do arquivo original é preservada (2 espaços, se for novo).
  const indent = pkg ? (/^[ \t]+/m.exec(await readFile(file, 'utf8'))?.[0] ?? '  ') : '  ';
  await writeFile(file, `${JSON.stringify(next, null, indent)}\n`);
  const note = [`+ ${added.join(', ')}`, kept.length ? `mantidos: ${kept.join(', ')}` : ''].filter(Boolean).join('; ');
  return { file: 'package.json', status: pkg ? 'atualizado' : 'criado', note };
}

async function updateGitignore(file: string): Promise<InitStep> {
  const current = existsSync(file) ? await readFile(file, 'utf8') : null;
  const lines = new Set((current ?? '').split(/\r?\n/).map((line) => line.trim().replace(/^\//, '')));
  const missing = IGNORED.filter((entry) => !lines.has(entry) && !lines.has(entry.replace(/\/$/, '')));
  if (!missing.length) return { file: '.gitignore', status: 'mantido', note: 'já ignora o site gerado' };
  const prefix = current === null ? '' : current.endsWith('\n') || current === '' ? '\n' : '\n\n';
  await writeFile(file, `${current ?? ''}${prefix}# SystemBook\n${missing.join('\n')}\n`);
  return { file: '.gitignore', status: current === null ? 'criado' : 'atualizado', note: `+ ${missing.join(', ')}` };
}

export function detectPackageManager(root: string, pkg: Pick<PackageJson, 'packageManager'> | null): PackageManager {
  const has = (file: string) => existsSync(path.join(root, file));
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return has('.yarnrc.yml') ? 'yarn-berry' : 'yarn';
  if (has('package-lock.json')) return 'npm';
  const declared = pkg?.packageManager?.split('@')[0];
  if (declared === 'pnpm') return 'pnpm';
  if (declared === 'yarn') return pkg!.packageManager!.startsWith('yarn@1') ? 'yarn' : 'yarn-berry';
  return 'npm';
}

/** Como rodar um bin do projeto (`pnpm exec systembook`) e instalar as dependências. */
export function packageManagerCommands(pm: PackageManager) {
  switch (pm) {
    case 'pnpm':
      return { install: 'pnpm install', ci: 'pnpm install --frozen-lockfile', exec: 'pnpm exec', run: 'pnpm' };
    case 'yarn':
      return { install: 'yarn', ci: 'yarn install --frozen-lockfile', exec: 'yarn', run: 'yarn' };
    case 'yarn-berry':
      return { install: 'yarn', ci: 'yarn install --immutable', exec: 'yarn', run: 'yarn' };
    case 'npm':
      return { install: 'npm install', ci: 'npm ci', exec: 'npx', run: 'npm run' };
  }
}

/** Nome do design system: o do `package.json` (sem escopo) ou o da pasta, legível. */
function projectName(root: string, pkg: PackageJson | null): string {
  const raw = (pkg?.name ?? path.basename(root)).replace(/^@[^/]+\//, '');
  const words = raw.split(/[-_.\s]+/).filter(Boolean);
  if (!words.length) return 'Design System';
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');
}

function configTemplate(name: string): string {
  return `import type { SystemBookConfig } from '@systembook/cli';

// Formato completo: https://github.com/mateusvillain/systembook/blob/main/docs/static-format.md
export default {
  name: ${JSON.stringify(name)},
  // logo: './brand/logo.svg',
  // contentDir: 'docs',
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

Esta é a página inicial da documentação, em \`docs/index.mdx\`. Comece pela [introdução](guide/basics/introduction.mdx).
`;

const INTRODUCTION = `---
title: Introdução
subtitle: Uma página de exemplo para você editar ou apagar.
status: Beta
---

## Como a documentação é organizada

As pastas de \`docs/\` viram a navegação:

- \`docs/guide/\` é um **menu** (no topo do site);
- \`docs/guide/basics/\` é uma **seção** (na barra lateral);
- \`docs/guide/basics/introduction.mdx\` é esta **página**.

Para criar uma página com tabs, troque o arquivo por uma pasta com um \`index.mdx\` (o Overview) e um arquivo por tab.

<Callout variant="tip">
  Rode \`systembook dev\` e edite este arquivo: o navegador recarrega ao salvar.
</Callout>

## Previews de componente

Crie um \`*.preview.tsx\` ao lado do componente e mostre-o aqui com \`<ComponentEmbed component="Button" variant="primary" />\`.
`;

function pagesWorkflow(pm: PackageManager, pkg: PackageJson | null): string {
  const commands = packageManagerCommands(pm);
  const cache = pm === 'yarn-berry' ? 'yarn' : pm;
  const pnpmSetup =
    pm === 'pnpm'
      ? `      - uses: pnpm/action-setup@v4
${pkg?.packageManager ? '' : '        with:\n          version: 10 # dispensável com o campo `packageManager` no package.json\n'}`
      : '';
  const corepack = pm === 'yarn-berry' ? '      - run: corepack enable\n' : '';
  return `# Publica a documentação no GitHub Pages a cada push na branch principal.
# No repositório: Settings → Pages → Source: "GitHub Actions".
name: Docs

on:
  push:
    branches: [main]
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
${pnpmSetup}${corepack}      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: ${cache}
      - run: ${commands.ci}
      - id: pages
        uses: actions/configure-pages@v5
      # Site de projeto fica em /<repo>/: o base_path vem do próprio Pages.
      - run: ${commands.exec} systembook build --base "\${{ steps.pages.outputs.base_path }}/"
      - uses: actions/upload-pages-artifact@v3
        with:
          path: systembook-dist

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
