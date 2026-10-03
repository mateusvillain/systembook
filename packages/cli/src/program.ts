import path from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { registerPreviewCommands } from '@systembook/connector';
import { buildStaticSite } from './build/index.js';
import { checkSite } from './check.js';
import { ConfigError, loadConfig } from './config.js';
import { startDevServer } from './dev/index.js';

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
    .command('build')
    .description('gera o site estático a partir do conteúdo em arquivos (systembook.config.*)')
    .option('--root <dir>', 'raiz do projeto, onde está a config', process.cwd())
    .action(async (options: { root: string }) => {
      const config = await loadProjectConfig(options.root);
      if (!config) return;
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
