import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    expect(result).toEqual({ ok: true, pages: 3, images: 2, variants: 2 });
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

  it('outDir perigoso é erro do check, junto dos de conteúdo', async () => {
    const root = project();
    writeFileSync(path.join(root, 'systembook.config.ts'), "export default { name: 'X', outDir: 'docs' };\n");
    const result = await checkSite(await loadConfig(root));
    expect(!result.ok && result.problems[0]).toContain('"outDir"');
  });
});
