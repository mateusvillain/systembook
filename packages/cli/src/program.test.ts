import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerPreviewCommands } from '@systembook/connector';
import { describe, expect, it, vi } from 'vitest';
import { createProgram } from './program.js';

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../connector/fixtures/sample-repo');

/** Roda `argv` num programa e devolve o que foi para stdout/stderr e o exit code. */
async function run(program: Command, argv: string[]) {
  const out: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => void out.push(a.join(' ')));
  process.exitCode = undefined;
  await program.parseAsync(argv, { from: 'user' });
  const exitCode = process.exitCode;
  process.exitCode = undefined;
  vi.restoreAllMocks();
  return { out: out.join('\n'), exitCode };
}

describe('systembook', () => {
  it('expõe os comandos do connector sob `previews`', () => {
    const previews = createProgram().commands.find((c) => c.name() === 'previews');
    expect(previews?.commands.map((c) => c.name())).toEqual(['discover', 'generate', 'build']);
  });

  it('`previews discover` se comporta como `systembook-connector discover`', async () => {
    const cli = await run(createProgram(), ['previews', 'discover', '--root', fixture]);
    const connector = await run(registerPreviewCommands(new Command('systembook-connector')), ['discover', '--root', fixture]);
    expect(cli).toEqual(connector);
    expect(cli.out).toContain('✓ src/button.preview.tsx — Button');
    expect(cli.out).toContain('3 arquivo(s) *.preview.tsx encontrado(s): 2 válido(s), 1 com erro.');
    expect(cli.exitCode).toBe(1);
  });
});
