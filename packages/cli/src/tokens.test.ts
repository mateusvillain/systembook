import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { loadProjectTokens } from './tokens.js';

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

/** Projeto temporário (em `.tmp/`, como nos outros testes do CLI) com config JSON. */
const TMP = fileURLToPath(new URL('../.tmp', import.meta.url));
async function project(tokens: unknown, files: Record<string, unknown>, setup?: (root: string) => void) {
  mkdirSync(TMP, { recursive: true });
  const root = mkdtempSync(path.join(TMP, 'tokens-'));
  dirs.push(root);
  writeFileSync(path.join(root, 'systembook.config.json'), JSON.stringify({ name: 'T', tokens }));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  setup?.(root);
  return loadProjectTokens(await loadConfig(root));
}

const color = (value: string) => ({ $type: 'color', $value: value });

describe('loadProjectTokens', () => {
  it('sem tokens na config: nada', async () => {
    expect(await project(undefined, {})).toEqual({ set: null, problems: [], warnings: [], sources: [] });
  });

  it('globs dos arquivos base, em ordem estável', async () => {
    const { set, problems } = await project('tokens/*.json', {
      'tokens/b.json': { b: color('#000') },
      'tokens/a.json': { a: color('#fff') },
      'other.json': { x: color('#f00') },
    });
    expect(problems).toEqual([]);
    expect(set?.modes).toEqual(['default']);
    expect(set?.tokens.map((t) => t.path)).toEqual(['a', 'b']);
  });

  it('modos na ordem da config, sobrepondo os base', async () => {
    const { set, problems } = await project(
      { files: 'tokens/base.json', modes: { light: 'tokens/light.json', dark: 'tokens/dark.json' } },
      {
        'tokens/base.json': { bg: color('#fff'), fg: { $value: '{text}', $type: 'color' } },
        'tokens/light.json': { text: color('#111') },
        'tokens/dark.json': { bg: color('#000'), text: color('#eee') },
      },
    );
    expect(problems).toEqual([]);
    expect(set?.modes).toEqual(['light', 'dark']);
    const fg = set?.tokens.find((t) => t.path === 'fg');
    expect([fg?.byMode.light?.resolvedValue, fg?.byMode.dark?.resolvedValue]).toEqual(['#111', '#eee']);
  });

  it('erros e avisos dos tokens, com o arquivo relativo à raiz', async () => {
    const { set, problems, warnings } = await project('tokens/*.json', {
      'tokens/a.json': { ok: color('#fff'), bad: color('nope'), x: { $value: 1, $type: 'number', $foo: 1 } },
    });
    expect(set?.tokens.map((t) => t.path)).toEqual(['ok', 'x']);
    expect(problems).toEqual([
      'tokens/a.json  bad: "nope" não é uma cor ("#0a84ff", "rgb(…)", um nome CSS ou { colorSpace, components }).',
    ]);
    expect(warnings).toEqual(['tokens/a.json  x: propriedade "$foo" não suportada; ignorada.']);
  });

  it('sem nenhum token válido, o conjunto é null', async () => {
    const { set, problems } = await project('t.json', { 't.json': { bad: color('nope') } });
    expect(set).toBeNull();
    expect(problems).toHaveLength(1);
  });

  it('padrão que não casa, fora do projeto, ou arquivo em dois lugares', async () => {
    const { problems } = await project(
      { files: ['tokens/*.json', 'nada/*.json', '../fora.json'], modes: { dark: 'tokens/a.json' } },
      { 'tokens/a.json': { a: color('#fff') } },
    );
    expect(problems).toEqual([
      'systembook.config.json: "tokens.files": "nada/*.json" não casa com nenhum arquivo.',
      'systembook.config.json: "tokens.files": "../fora.json" precisa ser relativo à raiz e dentro do projeto.',
      'systembook.config.json: "tokens.modes.dark": tokens/a.json já está em "tokens.files" — um arquivo é base ou de um modo, não os dois.',
    ]);
  });

  it('o mesmo arquivo em dois padrões do mesmo grupo entra uma vez', async () => {
    const { set, problems, warnings } = await project(['tokens/t.json', 'tokens/*.json'], { 'tokens/t.json': { a: color('#fff') } });
    expect(set?.tokens).toHaveLength(1);
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('glob largo ignora a config, o outDir e a pasta interna', async () => {
    const { set, problems } = await project('**/*.json', {
      'tokens/a.json': { a: color('#fff') },
      'systembook-dist/_systembook/data/nav.json': [],
      '.systembook/cache.json': {},
    });
    expect(problems).toEqual([]);
    expect(set?.tokens.map((t) => t.path)).toEqual(['a']);
  });

  it('"!padrão" exclui; "\\" vale como "/"; pasta solta não expande', async () => {
    const { set, problems } = await project(['tokens\\*.json', '!tokens/draft.json'], {
      'tokens/a.json': { a: color('#fff') },
      'tokens/draft.json': { draft: color('nope') },
    });
    expect(problems).toEqual([]);
    expect(set?.tokens.map((t) => t.path)).toEqual(['a']);
    expect((await project('tokens', { 'tokens/a.json': { a: color('#fff') } })).problems).toEqual([
      'systembook.config.json: "tokens.files": "tokens" não casa com nenhum arquivo.',
    ]);
    expect((await project('!x.json', {})).problems).toEqual([
      'systembook.config.json: "tokens.files": só há padrões de exclusão ("!…") — informe os arquivos a incluir.',
    ]);
  });

  it('arquivo com BOM é lido; link para fora do projeto não', async () => {
    const bom = await project('t.json', { 't.json': `\uFEFF${JSON.stringify({ a: color('#fff') })}` });
    expect(bom.problems).toEqual([]);
    expect(bom.set?.tokens).toHaveLength(1);

    mkdirSync(TMP, { recursive: true });
    const outside = mkdtempSync(path.join(TMP, 'outside-'));
    dirs.push(outside);
    writeFileSync(path.join(outside, 'x.json'), JSON.stringify({ x: color('#000') }));
    const linked = await project('*.tokens.json', {}, (root) => symlinkSync(path.join(outside, 'x.json'), path.join(root, 'x.tokens.json')));
    expect(linked.problems).toEqual(['x.tokens.json  aponta (link simbólico) para fora do projeto — não é lido.']);
  });

  it('um padrão errado não esconde os erros dos arquivos que casaram', async () => {
    const { problems } = await project(['nada/*.json', 't.json'], { 't.json': { bad: color('nope') } });
    expect(problems).toEqual([
      'systembook.config.json: "tokens.files": "nada/*.json" não casa com nenhum arquivo.',
      't.json  bad: "nope" não é uma cor ("#0a84ff", "rgb(…)", um nome CSS ou { colorSpace, components }).',
    ]);
  });

  it('ignora node_modules', async () => {
    const { set } = await project('**/*.tokens.json', {
      'a.tokens.json': { a: color('#fff') },
      'node_modules/pkg/b.tokens.json': { b: color('#000') },
    });
    expect(set?.tokens.map((t) => t.path)).toEqual(['a']);
  });
});
