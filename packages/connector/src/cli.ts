#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { discoverPreviews } from './discover.js';

const program = new Command('systembook-connector');

program
  .command('discover')
  .description('varre o repositório por arquivos *.preview.tsx e valida seus PreviewConfigs')
  .option('--root <dir>', 'diretório raiz da varredura', process.cwd())
  .action(async (options: { root: string }) => {
    const root = path.resolve(options.root);
    const { previews, failures } = await discoverPreviews({ root });

    for (const preview of previews) {
      const rel = path.relative(root, preview.filePath);
      console.log(
        `✓ ${rel} — ${preview.config.component} (${preview.config.variants.length} variante(s), ${preview.config.controls.length} controle(s))`,
      );
    }
    for (const failure of failures) {
      const rel = path.relative(root, failure.filePath);
      console.error(`✗ ${rel}\n  ${failure.message.split('\n').join('\n  ')}`);
    }

    console.log(
      `\n${previews.length + failures.length} arquivo(s) *.preview.tsx encontrado(s): ${previews.length} válido(s), ${failures.length} com erro.`,
    );
    if (failures.length > 0) {
      process.exitCode = 1;
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
