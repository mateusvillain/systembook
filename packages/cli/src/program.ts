import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { registerPreviewCommands } from '@systembook/connector';
import { buildStaticSite } from './build/index.js';
import { checkSite } from './check.js';
import { createInterface } from 'node:readline/promises';
import { ConfigError, loadConfig, withBase } from './config.js';
import { startDevServer } from './dev/index.js';
import { initProject, packageManagerCommands, PAGES_WORKFLOW } from './init.js';

/**
 * O programa `systembook`. Os comandos de preview vêm do connector, que é a
 * definição única deles; os do modo estático entram aqui como subcomandos.
 */
export function createProgram(): Command {
  const program = new Command('systembook').description(
    'SystemBook: documentação de design system, no modo CMS ou em arquivos (modo estático).',
  );

  registerPreviewCommands(
    program
      .command('previews')
      .description('previews de componentes: descobre os *.preview.tsx do repo e builda o artefato estático'),
  );

  program
    .command('init')
    .description('prepara o projeto para o modo estático: config, docs/, scripts e .gitignore')
    .option('--root <dir>', 'raiz do projeto', process.cwd())
    .option('--github-pages', 'também cria o workflow de deploy no GitHub Pages')
    .option('--no-github-pages', 'não cria o workflow (sem perguntar)')
    .option('-f, --force', 'sobrescreve arquivos existentes sem perguntar')
    .action(async (options: { root: string; githubPages?: boolean; force?: boolean }) => {
      const root = path.resolve(options.root);
      // Perguntas só num terminal; em CI/pipe, o padrão é não sobrescrever nada.
      const prompt = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
      // Ctrl+D/Ctrl+C na pergunta vale como "não".
      const ask = async (question: string) =>
        /^s/i.test((await prompt!.question(`${question} (s/N) `).catch(() => '')).trim());
      try {
        const githubPages = options.githubPages ?? (prompt ? await ask('Criar o workflow de deploy no GitHub Pages?') : false);
        const result = await initProject(root, {
          githubPages,
          force: options.force,
          confirm: prompt ? (file) => ask(`${file} já existe. Sobrescrever?`) : undefined,
        });
        for (const step of result.steps) {
          console.log(`  ${step.status.padEnd(11)} ${step.file}${step.note ? `  (${step.note})` : ''}`);
        }
        const pm = packageManagerCommands(result.packageManager);
        console.log(`\nPróximos passos:\n  ${pm.install}\n  ${pm.run} docs:dev`);
        if (githubPages && result.steps.some((s) => s.file === PAGES_WORKFLOW && s.status !== 'mantido')) {
          console.log('\nNo GitHub: Settings → Pages → Source: "GitHub Actions".');
        }
      } finally {
        prompt?.close();
      }
    });

  program
    .command('build')
    .description('gera o site estático a partir do conteúdo em arquivos (systembook.config.*)')
    .option('--root <dir>', 'raiz do projeto, onde está a config', process.cwd())
    .option('--base <path>', 'sobrescreve a base da config (ex.: o base_path do GitHub Pages no CI)')
    .action(async (options: { root: string; base?: string }) => {
      let config = await loadProjectConfig(options.root);
      if (!config) return;
      if (options.base !== undefined) {
        try {
          config = withBase(config, options.base);
        } catch (error) {
          if (!(error instanceof ConfigError)) throw error;
          reportProblems(error.problems);
          return;
        }
      }
      const result = await buildStaticSite(config);
      if (!result.ok) {
        reportProblems(result.problems);
        return;
      }
      const shown = path.relative(process.cwd(), result.outDir);
      console.log(
        `Site estático em ${shown.startsWith('..') ? result.outDir : shown || '.'} — ${result.routes} rota(s), base ${config.base}`,
      );
    });

  program
    .command('check')
    .description('valida conteúdo, config e referências sem gerar o site (para rodar em PR)')
    .option('--root <dir>', 'raiz do projeto, onde está a config', process.cwd())
    .action(async (options: { root: string }) => {
      const config = await loadProjectConfig(options.root);
      if (!config) return;
      const result = await checkSite(config);
      if (!result.ok) {
        reportProblems(result.problems);
        return;
      }
      console.log(
        `✓ Sem erros — ${result.pages} página(s), ${result.images} imagem(ns), ${result.variants} variante(s) de preview.`,
      );
    });

  program
    .command('dev')
    .description('servidor local do site estático, que recarrega ao salvar conteúdo, config ou *.preview.tsx')
    .option('--root <dir>', 'raiz do projeto, onde está a config', process.cwd())
    .option('--port <port>', 'porta (ocupada, tenta a seguinte)', parsePort, 4000)
    .action(async (options: { root: string; port: number }) => {
      try {
        await startDevServer(path.resolve(options.root), { port: options.port });
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        reportProblems(error.problems);
      }
    });

  return program;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new InvalidArgumentError('precisa ser um número de porta.');
  }
  return port;
}

/** Carrega a config; problemas são reportados e viram exit code 1. */
async function loadProjectConfig(root: string) {
  try {
    return await loadConfig(path.resolve(root));
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    reportProblems(error.problems);
    return null;
  }
}

function reportProblems(problems: string[]): void {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} erro(s).`);
  process.exitCode = 1;
}
