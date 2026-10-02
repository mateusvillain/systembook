#!/usr/bin/env node
import { Command } from 'commander';
import { registerPreviewCommands } from './commands.js';

// Depreciado: os mesmos comandos vivem em `systembook previews` (@systembook/cli).
console.warn(
  'Aviso: `systembook-connector` está depreciado. Use `systembook previews <comando>` do pacote @systembook/cli.\n',
);

const program = registerPreviewCommands(new Command('systembook-connector'));

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
