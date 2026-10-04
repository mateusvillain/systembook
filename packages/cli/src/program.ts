import path from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { Command, InvalidArgumentError } from 'commander';
import { registerPreviewCommands } from '@systembook/connector';
import { buildStaticSite } from './build/index.js';
import { checkSite } from './check.js';
import { ConfigError, loadConfig, withBase } from './config.js';
import { startDevServer } from './dev/index.js';
import { ExportError, exportProject } from './export/index.js';
import { ImportError, importProject } from './import/index.js';
import { initProject, PAGES_WORKFLOW_FILE } from './init.js';

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
      // Ctrl+C aborta o init inteiro (não vale como "não" e segue escrevendo).
      prompt?.on('SIGINT', () => {
        prompt.close();
        process.stdout.write('\n');
        process.exit(130);
      });
      try {
        const githubPages =
          options.githubPages ?? (prompt ? await ask(prompt, 'Criar o workflow de deploy no GitHub Pages?') : false);
        const result = await initProject(root, {
          githubPages,
          force: options.force,
          confirm: prompt ? (file) => ask(prompt, `${file} já existe. Sobrescrever?`) : undefined,
        });
        for (const step of result.steps) {
          console.log(`  ${step.status.padEnd(11)} ${step.file}${step.note ? `  (${step.note})` : ''}`);
        }
        const pm = result.packageManager;
        console.log(`\nPróximos passos:\n  ${pm.install}\n  ${pm.run} docs:dev`);
        const workflow = result.steps.find((s) => s.file.endsWith(PAGES_WORKFLOW_FILE));
        if (workflow && workflow.status !== 'mantido') {
          console.log('\nNo GitHub: Settings → Pages → Source: "GitHub Actions". Faça commit do lockfile.');
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

  program
    .command('export')
    .description('converte uma instância CMS num projeto do modo estático (só o conteúdo publicado)')
    .requiredOption('--from <url>', 'URL da instância CMS')
    .option('--token <token>', 'token de escopo Migration (ou a variável SYSTEMBOOK_TOKEN)')
    .option('--out <dir>', 'pasta do projeto gerado', 'systembook-export')
    .option('-f, --force', 'escreve numa pasta que já tem arquivos, por cima dos de mesmo nome')
    .action(async (options: { from: string; token?: string; out: string; force?: boolean }) => {
      const token = options.token ?? process.env.SYSTEMBOOK_TOKEN;
      if (!token) {
        reportProblems(['informe o token com --token ou na variável SYSTEMBOOK_TOKEN.']);
        return;
      }
      try {
        const result = await exportProject({ from: options.from, token, out: options.out, force: options.force });
        for (const warning of result.warnings) console.warn(`aviso: ${warning}`);
        if (result.unpublished.length) {
          console.warn(`\n${result.unpublished.length} página(s) nunca publicada(s) ficaram de fora:`);
          for (const page of result.unpublished) {
            console.warn(`  ${page.menu}/${page.section}/${page.slug}  (${page.titulo})`);
          }
        }
        const relative = path.relative(process.cwd(), result.out);
        const shown = relative.startsWith('..') ? result.out : relative || '.';
        console.log(
          `\nProjeto em ${shown} — ${result.pages} página(s), ${result.images} imagem(ns) baixada(s), ${result.warnings.length} aviso(s).`,
        );
        console.log(`Próximo passo: systembook check --root ${shown}`);
      } catch (error) {
        if (!(error instanceof ExportError)) throw error;
        reportProblems([error.message]);
      }
    });

  program
    .command('import')
    .description('envia o projeto do modo estático para uma instância CMS, que cria tudo e publica')
    .requiredOption('--to <url>', 'URL da instância CMS')
    .option('--token <token>', 'token de escopo Migration (ou a variável SYSTEMBOOK_TOKEN)')
    .option('--root <dir>', 'raiz do projeto, onde está a config', process.cwd())
    .option('--overwrite', 'substitui as páginas (e a landing) que já existem na instância, em vez de falhar')
    .action(async (options: { to: string; token?: string; root: string; overwrite?: boolean }) => {
      const token = options.token ?? process.env.SYSTEMBOOK_TOKEN;
      if (!token) {
        reportProblems(['informe o token com --token ou na variável SYSTEMBOOK_TOKEN.']);
        return;
      }
      const config = await loadProjectConfig(options.root);
      if (!config) return;
      try {
        const result = await importProject(config, { to: options.to, token, overwrite: options.overwrite });
        for (const warning of result.warnings) console.warn(`aviso: ${warning}`);
        const { menus, sections, pages } = result.created;
        console.log(
          `Importado em ${options.to} — criado(s): ${menus} menu(s), ${sections} seção(ões), ${pages} página(s); ${result.replaced} página(s) substituída(s); ${result.images} imagem(ns). Tudo publicado.`,
        );
        if (!result.settingsApplied) {
          console.log('O nome e os logos da config não foram aplicados: a instância já tinha conteúdo (use --overwrite para aplicá-los).');
        }
      } catch (error) {
        if (!(error instanceof ImportError)) throw error;
        reportProblems(error.problems);
      }
    });

  return program;
}

/** Pergunta sim/não; Ctrl+D (fim da entrada) vale como "não". */
async function ask(prompt: Interface, question: string): Promise<boolean> {
  const answer = await prompt.question(`${question} (s/N) `).catch(() => '');
  return /^s/i.test(answer.trim());
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
