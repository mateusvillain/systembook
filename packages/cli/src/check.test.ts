import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { checkSite } from './check.js';
import { loadConfig } from './config.js';
import { createProgram } from './program.js';

const FIXTURE = fileURLToPath(new URL('../fixtures/static-site', import.meta.url));
const TMP = fileURLToPath(new URL('../.tmp', import.meta.url));
mkdirSync(TMP, { recursive: true });
const temps: string[] = [];
afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** Cópia do fixture num projeto temporário. */
function project(): string {
  const root = mkdtempSync(path.join(TMP, 'check-'));
  temps.push(root);
  cpSync(FIXTURE, root, {
    recursive: true,
    filter: (src) => !src.includes('systembook-dist') && !src.includes('.systembook'),
  });
  return root;
}

/** Cada arquivo do projeto com tamanho e mtime: o que mudaria se algo fosse escrito. */
function snapshot(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .map((e) => path.join(e.parentPath, e.name))
    .map((file) => `${path.relative(dir, file)} ${statSync(file).size} ${statSync(file).mtimeMs}`)
    .sort();
}

describe('systembook check', { timeout: 60_000 }, () => {
  it('projeto válido: ok, com um resumo, sem escrever nada no projeto', async () => {
    const root = project();
    const before = snapshot(root);
    const result = await checkSite(await loadConfig(root));
    expect(result).toEqual({ ok: true, pages: 3, images: 2, variants: 2, tokens: 0, modes: 0, warnings: [] });
    expect(snapshot(root)).toEqual(before);
  });

  it('lista todos os erros de uma vez, com arquivo:linha:coluna, e o comando sai com 1', async () => {
    const root = project();
    writeFileSync(
      path.join(root, 'docs/components/actions/button.mdx'),
      [
        '---',
        'title: Button',
        'status: Beta',
        '---',
        '',
        '#### fundo demais',
        '',
        '![x](./sumiu.png)',
        '',
        'Veja [aqui](./nao-existe.mdx).',
        '',
        '<ComponentEmbed component="Button" variant="ghost" />',
        '',
      ].join('\n'),
    );
    const before = snapshot(root);
    const result = await checkSite(await loadConfig(root));
    expect(!result.ok && result.problems.map((p) => p.split('  ')[0])).toEqual([
      'docs/components/actions/button.mdx:1:1',
      'docs/components/actions/button.mdx:6:1',
      'docs/components/actions/button.mdx:8:1',
      'docs/components/actions/button.mdx:10:6',
      'docs/components/actions/button.mdx:12:1',
    ]);
    expect(snapshot(root)).toEqual(before);

    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a.join(' ')));
    let exitCode: typeof process.exitCode;
    try {
      process.exitCode = undefined;
      await createProgram().parseAsync(['check', '--root', root], { from: 'user' });
      exitCode = process.exitCode;
    } finally {
      process.exitCode = undefined;
      vi.restoreAllMocks();
    }
    expect(exitCode).toBe(1);
    expect(errors.at(-1)).toBe('\n5 erro(s).');
  });

  it('config com campo inválido: o comando para nela (sem config não há conteúdo a ler)', async () => {
    const root = project();
    writeFileSync(path.join(root, 'systembook.config.ts'), "export default { name: '', titel: 'x' };\n");
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a.join(' ')));
    let exitCode: typeof process.exitCode;
    try {
      process.exitCode = undefined;
      await createProgram().parseAsync(['check', '--root', root], { from: 'user' });
      exitCode = process.exitCode;
    } finally {
      process.exitCode = undefined;
      vi.restoreAllMocks();
    }
    expect(exitCode).toBe(1);
    expect(errors.slice(0, -1).every((e) => e.startsWith('systembook.config.ts:'))).toBe(true);
    expect(errors.at(-1)).toBe('\n2 erro(s).');
  });

  it('tokens: erro sai com 1; só aviso sai com 0, listando os avisos e o resumo', async () => {
    const root = project();
    mkdirSync(path.join(root, 'tokens'));
    const configFile = path.join(root, 'systembook.config.ts');
    writeFileSync(
      configFile,
      readFileSync(configFile, 'utf8').replace(
        /\} satisfies SystemBookConfig;/,
        "  tokens: { files: 'tokens/base.json', modes: { light: 'tokens/light.json', dark: 'tokens/dark.json' } },\n} satisfies SystemBookConfig;",
      ),
    );
    const write = (name: string, tokens: unknown) => writeFileSync(path.join(root, 'tokens', name), JSON.stringify(tokens));
    write('base.json', { fg: { $type: 'color', $value: '{text}', $foo: 1 } });
    write('light.json', { text: { $type: 'color', $value: '#111' } });
    write('dark.json', { text: { $type: 'color', $value: 'nope' } });

    const run = async () => {
      const out: string[] = [];
      const errors: string[] = [];
      const warnings: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
      vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a.join(' ')));
      vi.spyOn(console, 'warn').mockImplementation((...a) => void warnings.push(a.join(' ')));
      try {
        process.exitCode = undefined;
        await createProgram().parseAsync(['check', '--root', root], { from: 'user' });
        return { exitCode: process.exitCode, out, errors, warnings };
      } finally {
        process.exitCode = undefined;
        vi.restoreAllMocks();
      }
    };

    const failed = await run();
    expect(failed.exitCode).toBe(1);
    expect(failed.errors).toEqual([
      'tokens/base.json  fg: o alias {text} aponta para um token com erro.',
      'tokens/dark.json  text: "nope" não é uma cor ("#0a84ff", "rgb(…)", um nome CSS ou { colorSpace, components }) (modo dark).',
      '\n2 erro(s).',
    ]);

    write('dark.json', { text: { $type: 'color', $value: '#eee' } });
    const passed = await run();
    expect(passed.exitCode).toBeUndefined();
    expect(passed.warnings).toEqual(['aviso: tokens/base.json  fg: propriedade "$foo" não suportada; ignorada.']);
    expect(passed.out).toEqual([
      '✓ Sem erros (1 aviso(s)) — 3 página(s), 2 imagem(ns), 2 variante(s) de preview, 2 token(s) em 2 modo(s).',
    ]);
  });

  it('outDir perigoso é erro do check, junto dos de conteúdo', async () => {
    const root = project();
    writeFileSync(path.join(root, 'systembook.config.ts'), "export default { name: 'X', outDir: 'docs' };\n");
    const result = await checkSite(await loadConfig(root));
    expect(!result.ok && result.problems[0]).toContain('"outDir"');
  });
});
