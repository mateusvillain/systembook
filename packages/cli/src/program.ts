import { Command } from 'commander';
import { registerPreviewCommands } from '@systembook/connector';

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

  return program;
}
