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

describe('loadConfig — tokens', () => {
  const json = (tokens: unknown) => project({ 'systembook.config.json': JSON.stringify({ name: 'T', tokens }) });

  it('normaliza as três formas', async () => {
    expect((await loadConfig(json('tokens/*.json'))).tokens).toEqual({ files: ['tokens/*.json'], modes: [] });
    expect((await loadConfig(json(['a.json', 'b.json']))).tokens).toEqual({ files: ['a.json', 'b.json'], modes: [] });
    expect((await loadConfig(json({ files: 'base.json', modes: { light: 'light.json', dark: ['dark/*.json'] } }))).tokens).toEqual({
      files: ['base.json'],
      modes: [
        { name: 'light', files: ['light.json'] },
        { name: 'dark', files: ['dark/*.json'] },
      ],
    });
    expect((await loadConfig(json({ modes: { light: 'l.json' } }))).tokens).toEqual({
      files: [],
      modes: [{ name: 'light', files: ['l.json'] }],
    });
    expect((await loadConfig(json(undefined))).tokens).toBeUndefined();
  });

  it('recusa formas inválidas', async () => {
    const shape = 'systembook.config.json: "tokens": use um arquivo ou glob, uma lista deles, ou { files, modes }';
    expect(await problems(json([]))).toEqual(['systembook.config.json: "tokens": informe ao menos um arquivo, em "files" ou em "modes"']);
    expect(await problems(json({}))).toEqual(['systembook.config.json: "tokens": informe ao menos um arquivo, em "files" ou em "modes"']);
    expect(await problems(json({ modes: { dark: [] } }))).toEqual(['systembook.config.json: "tokens.modes.dark": a lista não pode ser vazia']);
    expect(await problems(json({ modes: { ' ': 'x.json' } }))).toEqual(['systembook.config.json: "tokens.modes": nome de modo vazio (" ")']);
    expect(await problems(json({ file: 'x.json' }))).toEqual([shape]);
    expect(await problems(json(3))).toEqual([shape]);
  });
});

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

describe('loadConfig — locales (SYS-163)', () => {
  const json = (locales: unknown, extra: Record<string, unknown> = {}) =>
    project({ 'systembook.config.json': JSON.stringify({ name: 'T', ...extra, locales }) });

  it('sem locales: só o padrão en', async () => {
    expect((await loadConfig(json(undefined))).locales).toEqual({ default: { code: 'en', label: 'English' }, translations: [] });
  });

  it('caminhos absolutos; a pasta padrão é irmã do conteúdo com o segmento do idioma', async () => {
    const root = json(
      {
        default: { code: 'en', label: 'English' },
        translations: [
          { code: 'pt-BR', label: 'Português' },
          { code: 'es', label: 'Español', dir: 'traducoes/es' },
        ],
      },
      { contentDir: 'content' },
    );
    expect((await loadConfig(root)).locales).toEqual({
      default: { code: 'en', label: 'English' },
      translations: [
        { code: 'pt-BR', label: 'Português', dir: path.join(root, 'content-pt-br') },
        { code: 'es', label: 'Español', dir: path.join(root, 'traducoes/es') },
      ],
    });
    // sem contentDir, docs → docs-pt-br
    const plain = json({ default: { code: 'pt-BR', label: 'Português' }, translations: [{ code: 'en', label: 'English' }] });
    expect((await loadConfig(plain)).locales.translations[0]!.dir).toBe(path.join(plain, 'docs-en'));
  });

  it('recusa código inválido, repetido ou com o mesmo segmento de URL', async () => {
    const f = 'systembook.config.json';
    expect(await problems(json({ default: { code: 'english', label: 'E' } }))).toEqual([
      `${f}: "locales.default.code": código de idioma inválido — use uma tag BCP 47 (ex.: "en", "pt-BR")`,
    ]);
    expect(
      await problems(json({ default: { code: 'en', label: 'E' }, translations: [{ code: 'pt-BR', label: 'P' }, { code: 'en', label: 'E2' }] })),
    ).toEqual([`${f}: "locales.translations.1.code": código "en" repetido`]);
    expect(
      await problems(json({ default: { code: 'en', label: 'E' }, translations: [{ code: 'pt-BR', label: 'P' }, { code: 'pt-br', label: 'P2', dir: 'x' }] })),
    ).toEqual([`${f}: "locales.translations.1.code": "pt-br" e "pt-BR" dão o mesmo segmento de URL ("pt-br") — use um só`]);
  });

  it('recusa campo desconhecido e rótulo vazio', async () => {
    const f = 'systembook.config.json';
    expect(await problems(json({ default: { code: 'en', label: 'E' }, extra: 1 }))).toEqual([`${f}: "locales": Unrecognized key: "extra"`]);
    expect(await problems(json({ default: { code: 'en', label: ' ' } }))).toEqual([`${f}: "locales.default.label": é obrigatório`]);
  });

  it('recusa pasta sobreposta ao conteúdo, ao outDir ou à de outro idioma', async () => {
    const f = 'systembook.config.json: "locales.translations';
    const translations = (...dirs: (string | undefined)[]) => ({
      default: { code: 'en', label: 'E' },
      translations: dirs.map((dir, i) => ({ code: ['pt-BR', 'es', 'fr'][i], label: 'X', ...(dir && { dir }) })),
    });
    expect(await problems(json(translations('docs')))).toEqual([
      `${f}.0.dir": a pasta de "pt-BR" (docs) se sobrepõe ao "contentDir" (docs) — use uma pasta própria.`,
    ]);
    expect(await problems(json(translations('docs/pt')))).toEqual([
      `${f}.0.dir": a pasta de "pt-BR" (docs/pt) se sobrepõe ao "contentDir" (docs) — use uma pasta própria.`,
    ]);
    expect(await problems(json(translations('systembook-dist')))).toEqual([
      `${f}.0.dir": a pasta de "pt-BR" (systembook-dist) se sobrepõe ao "outDir" (systembook-dist), que é apagado a cada build.`,
    ]);
    expect(await problems(json(translations('t', 't/es')))).toEqual([
      `${f}.1.dir": a pasta de "es" (t/es) se sobrepõe à de "pt-BR" (t) — cada idioma tem a sua.`,
    ]);
    expect(await problems(json(translations(undefined, 'docs-pt-br')))).toEqual([
      `${f}.1.dir": a pasta de "es" (docs-pt-br) se sobrepõe à de "pt-BR" (docs-pt-br) — cada idioma tem a sua.`,
    ]);
  });
});
