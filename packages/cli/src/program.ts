import path from 'node:path';
import { Command } from 'commander';
import { registerPreviewCommands } from '@systembook/connector';
import { buildStaticSite } from './build/index.js';
import { ConfigError, loadConfig } from './config.js';

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

  return program;
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
