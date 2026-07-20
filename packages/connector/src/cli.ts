#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { buildEntries } from './build.js';
import { discoverPreviews } from './discover.js';
import { generateEntries } from './generate.js';

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

program
  .command('generate')
  .description('gera um entrypoint Vite por variante a partir dos *.preview.tsx descobertos')
  .option('--root <dir>', 'diretório raiz da varredura', process.cwd())
  .option('--out-dir <dir>', 'destino das entradas (default: <root>/.systembook/entries)')
  .action(async (options: { root: string; outDir?: string }) => {
    const root = path.resolve(options.root);
    const { previews, failures } = await discoverPreviews({ root });

    for (const failure of failures) {
      const rel = path.relative(root, failure.filePath);
      console.error(`✗ ${rel}\n  ${failure.message.split('\n').join('\n  ')}`);
    }

    const entries = await generateEntries(previews, { root, outDir: options.outDir });
    for (const entry of entries) {
      console.log(`✓ ${path.relative(root, entry.entryDir)} (${entry.componentName} / ${entry.variantId})`);
    }

    console.log(
      `\n${entries.length} entrada(s) gerada(s) de ${previews.length} preview(s)` +
        (failures.length > 0 ? `; ${failures.length} arquivo(s) com erro ignorado(s).` : '.'),
    );
    if (failures.length > 0) {
      process.exitCode = 1;
    }
  });

program
  .command('build')
  .description('discover + generate + build Vite: produz o artefato estático de todas as variantes')
  .option('--root <dir>', 'diretório raiz da varredura', process.cwd())
  .option('--out <dir>', 'destino do artefato (default: <root>/.systembook/dist)')
  .action(async (options: { root: string; out?: string }) => {
    const root = path.resolve(options.root);
    const { previews, failures } = await discoverPreviews({ root });

    for (const failure of failures) {
      const rel = path.relative(root, failure.filePath);
      console.error(`✗ ${rel}\n  ${failure.message.split('\n').join('\n  ')}`);
    }

    const entries = await generateEntries(previews, { root });
    const { outDir } = await buildEntries(entries, { root, outDir: options.out });

    console.log(
      `Artefato estático em ${path.relative(process.cwd(), outDir) || outDir} — ${entries.length} variante(s) de ${previews.length} componente(s).`,
    );
    if (failures.length > 0) {
      console.error(`Atenção: ${failures.length} arquivo(s) *.preview.tsx inválido(s) ficaram fora do artefato.`);
      process.exitCode = 1;
    }
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
