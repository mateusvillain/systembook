import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerPreviewCommands } from '@systembook/connector';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('systembook tokens (SYS-144)', () => {
  const TMP = fileURLToPath(new URL('../.tmp', import.meta.url));
  let root: string;
  let server: Server;
  let url: string;
  /** O que a instância falsa recebeu, e o que ela responde. */
  let received: { authorization?: string; body: { commitSha: string; sources: { file: string; mode?: string }[] } }[];
  let reply: { status: number; body: unknown };

  beforeEach(async () => {
    mkdirSync(TMP, { recursive: true });
    root = mkdtempSync(path.join(TMP, 'tokens-cli-'));
    writeFileSync(
      path.join(root, 'systembook.config.json'),
      JSON.stringify({ name: 'T', tokens: { files: ['tokens/base.json'], modes: { dark: 'tokens/dark.json' } } }),
    );
    mkdirSync(path.join(root, 'tokens'));
    writeFileSync(path.join(root, 'tokens/base.json'), JSON.stringify({ color: { brand: { $type: 'color', $value: '#4f46e5' } } }));
    writeFileSync(path.join(root, 'tokens/dark.json'), JSON.stringify({ color: { brand: { $value: '#818cf8' } } }));

    received = [];
    reply = { status: 201, body: { id: 'x', commitSha: 'abc1234def', modes: ['dark'], tokens: 1, warnings: [] } };
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        if (req.url === '/api/tokens') received.push({ authorization: req.headers.authorization, body: JSON.parse(raw) });
        res.writeHead(req.url === '/api/tokens' ? reply.status : 404, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    url = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  });

  const tokens = (...extra: string[]) =>
    run(createProgram(), ['tokens', '--to', url, '--token', 'sekret', '--root', root, ...extra]);

  it('envia os arquivos com o commit e o token, e resume o que a instância publicou', async () => {
    const result = await tokens('--commit', 'abc1234def');
    expect(result.exitCode).toBeUndefined();
    expect(result.out).toBe(`Publicado em ${url} — 1 token(s), commit abc1234.`);
    expect(received).toHaveLength(1);
    expect(received[0]!.authorization).toBe('Bearer sekret');
    expect(received[0]!.body.commitSha).toBe('abc1234def');
    expect(received[0]!.body.sources.map((s) => [s.file, s.mode])).toEqual([
      ['tokens/base.json', undefined],
      ['tokens/dark.json', 'dark'],
    ]);
  });

  it('sem --commit, usa o GITHUB_SHA', async () => {
    vi.stubEnv('GITHUB_SHA', 'fromci0001');
    await tokens();
    vi.unstubAllEnvs();
    expect(received[0]!.body.commitSha).toBe('fromci0001');
  });

  it('erro local (de token ou de config) aborta antes de enviar', async () => {
    writeFileSync(
      path.join(root, 'tokens/base.json'),
      JSON.stringify({ color: { brand: { $type: 'color', $value: '#000' }, bad: { $type: 'color', $value: 'nope' } } }),
    );
    const invalid = await tokens('--commit', 'a');
    expect(invalid.exitCode).toBe(1);
    expect(invalid.out).toContain('tokens/base.json  color.bad: "nope" não é uma cor');
    expect(invalid.out).toContain('nada foi enviado.');

    writeFileSync(
      path.join(root, 'systembook.config.json'),
      JSON.stringify({ name: 'T', tokens: { files: ['tokens/nao-existe.json'] } }),
    );
    const config = await tokens('--commit', 'a');
    expect(config.exitCode).toBe(1);
    expect(config.out).toContain('"tokens/nao-existe.json" não casa com nenhum arquivo.');
    expect(received).toEqual([]);
  });

  it('mensagens claras para 401, 403, 422 e rede', async () => {
    reply = { status: 401, body: { error: 'x' } };
    expect((await tokens('--commit', 'a')).out).toContain('a instância recusou o token (ausente, inválido ou revogado)');

    reply = { status: 403, body: { error: 'x' } };
    expect((await tokens('--commit', 'a')).out).toContain('o token é de outro escopo');

    reply = { status: 422, body: { error: 'tokens inválidos', diagnostics: [{ file: 'tokens/base.json', path: 'color.brand', message: 'ruim.' }] } };
    const rejected = await tokens('--commit', 'a');
    expect(rejected.exitCode).toBe(1);
    expect(rejected.out).toContain('tokens/base.json  color.brand: ruim.');
    expect(rejected.out).toContain('nada foi publicado.');

    const down = await run(createProgram(), ['tokens', '--to', 'http://localhost:1', '--token', 't', '--root', root, '--commit', 'a']);
    expect(down.exitCode).toBe(1);
    expect(down.out).toContain('não foi possível conectar a http://localhost:1');
  });

  it('sem token nem SYSTEMBOOK_TOKEN, e sem tokens na config', async () => {
    vi.stubEnv('SYSTEMBOOK_TOKEN', '');
    const noToken = await run(createProgram(), ['tokens', '--to', url, '--root', root]);
    vi.unstubAllEnvs();
    expect(noToken.out).toContain('informe o token com --token ou na variável SYSTEMBOOK_TOKEN.');

    writeFileSync(path.join(root, 'systembook.config.json'), JSON.stringify({ name: 'T' }));
    const noConfig = await tokens('--commit', 'a');
    expect(noConfig.exitCode).toBe(1);
    expect(noConfig.out).toContain('sem "tokens"');
    expect(received).toEqual([]);
  });
});
