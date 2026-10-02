import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

/**
 * Projeto temporário com os arquivos dados. Fica dentro do pacote (em
 * `.tmp/`, ignorado pelo git) porque o vitest não importa módulos de fora da
 * raiz — e a config `.ts`/`.mjs` é carregada por `import()`. No Node puro, o
 * CLI de verdade, isso não se aplica.
 */
const TMP = fileURLToPath(new URL('../.tmp', import.meta.url));
function project(files: Record<string, string>): string {
  mkdirSync(TMP, { recursive: true });
  const dir = mkdtempSync(path.join(TMP, 'config-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return dir;
}

async function problems(root: string): Promise<string[]> {
  try {
    await loadConfig(root);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
}

describe('loadConfig', () => {
  it('lê .ts com tipos e aplica os padrões', async () => {
    const root = project({
      'systembook.config.ts': `
        import type { SystemBookConfig } from '@systembook/cli';
        const name: string = 'Acme';
        export default { name, base: '/acme' } satisfies SystemBookConfig;
      `,
    });
    const config = await loadConfig(root);
    expect(config).toMatchObject({
      name: 'Acme',
      base: '/acme/',
      file: 'systembook.config.ts',
      contentDir: path.join(root, 'docs'),
      outDir: path.join(root, 'systembook-dist'),
      statusTags: [],
    });
    expect(config.previews).toBeUndefined();
  });

  it('lê .json e .mjs', async () => {
    expect((await loadConfig(project({ 'systembook.config.json': '{ "name": "J", "contentDir": "content" }' }))).contentDir).toMatch(/content$/);
    expect((await loadConfig(project({ 'systembook.config.mjs': 'export default { name: "M" }' }))).name).toBe('M');
  });

  it('campo desconhecido, obrigatório ausente e base sem barra viram erros, todos de uma vez', async () => {
    const root = project({ 'systembook.config.json': '{ "titel": "x", "base": "repo" }' });
    const list = await problems(root);
    expect(list).toHaveLength(3);
    expect(list.join('\n')).toContain('"name"');
    expect(list.join('\n')).toContain('titel');
    expect(list.join('\n')).toContain('"base": precisa começar com "/"');
  });

  it('sem config, com duas configs, sem export default e JSON quebrado', async () => {
    expect((await problems(project({})))[0]).toContain('nenhum systembook.config.ts');
    expect((await problems(project({ 'systembook.config.json': '{}', 'systembook.config.mjs': '' })))[0]).toContain(
      'mais de uma config',
    );
    expect((await problems(project({ 'systembook.config.mjs': 'export const name = "x";' })))[0]).toContain('export default');
    expect((await problems(project({ 'systembook.config.json': '{ name: ' })))[0]).toContain('JSON inválido');
  });
});
