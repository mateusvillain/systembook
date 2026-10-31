import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { startDevServer, type DevServer } from './index.js';

const FIXTURE = fileURLToPath(new URL('../../fixtures/static-site', import.meta.url));
const TMP = fileURLToPath(new URL('../../.tmp', import.meta.url));
mkdirSync(TMP, { recursive: true });
const cleanup: (() => unknown)[] = [];
afterAll(async () => {
  for (const fn of cleanup.reverse()) await fn();
});

/** Sobe o `dev` numa cópia do fixture; `next()` espera a próxima atualização. */
async function devFixture(setup?: (root: string) => void) {
  const root = mkdtempSync(path.join(TMP, 'dev-'));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  cpSync(FIXTURE, root, { recursive: true, filter: (src) => !src.includes('systembook-dist') });
  setup?.(root);

  let waiting: ((problems: string[]) => void) | null = null;
  let first!: string[];
  const server: DevServer = await startDevServer(root, {
    port: 0,
    onUpdate: ({ problems }) => {
      first ??= problems;
      waiting?.(problems);
      waiting = null;
    },
  });
  cleanup.push(() => server.close());

  const edit = (file: string, change: (text: string) => string) => {
    const full = path.join(root, file);
    writeFileSync(full, change(readFileSync(full, 'utf8')));
  };
  const next = () => new Promise<string[]>((resolve) => (waiting = resolve));
  const get = (url: string) => fetch(`${server.url}${url}`);
  return { root, server, first, edit, next, get };
}

describe('systembook dev', { timeout: 60_000 }, () => {
  it('serve o site e os dados em memória, e acompanha o conteúdo', async () => {
    const { root, server, first, edit, next, get } = await devFixture();
    expect(first).toEqual([]);
    expect(server.url).toMatch(/^http:\/\/localhost:\d+\/acme-ds\/$/);

    // Cada rota com o seu <head>, como no build.
    const html = await (await get('foundation/color/palette')).text();
    expect(html).toContain('<title>Palette · Acme DS</title>');
    expect(html).toContain('<meta name="description" content="As cores base do sistema." />');

    const palette = () => get('_systembook/data/pages/foundation/color/palette.json').then((r) => r.json());
    expect(JSON.stringify(await palette())).toContain('Cores');

    // As mídias com hash e o preview (com CORS, para o iframe sandboxed).
    const settings = (await (await get('_systembook/data/settings.json')).json()) as { logoUrl: string };
    const logo = await fetch(new URL(settings.logoUrl, server.url));
    expect(logo.headers.get('content-type')).toBe('image/svg+xml');
    const preview = await get('_systembook/previews/button--primary/index.html');
    expect(preview.status).toBe(200);
    expect(preview.headers.get('access-control-allow-origin')).toBe('*');

    // Salvar o .mdx atualiza os dados sem reiniciar.
    const updated = next();
    edit('docs/foundation/color/palette.mdx', (text) => text.replace('## Cores', '## Cores ao vivo'));
    expect(await updated).toEqual([]);
    expect(JSON.stringify(await palette())).toContain('Cores ao vivo');

    // Salvar o *.preview.tsx rebuilda o preview servido ao iframe.
    const bundle = () =>
      readdirSync(path.join(root, '.systembook/dev/previews'), { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFileSync(path.join(root, '.systembook/dev/previews', file), 'utf8'))
        .join('\n');
    expect(bundle()).not.toContain('Salvar ao vivo');
    const rebuilt = next();
    edit('src/button.preview.tsx', (text) => text.replace("?? 'Salvar')", "?? 'Salvar ao vivo')"));
    expect(await rebuilt).toEqual([]);
    expect(bundle()).toContain('Salvar ao vivo');

    // Arquivo inexistente na pasta de dados é 404, não o index.html do SPA.
    expect((await get('_systembook/data/pages/nao/existe/mesmo.json')).status).toBe(404);
  });

  it('erro de conteúdo ou de config vira problema, e o servidor segue de pé', async () => {
    const { edit, next, get } = await devFixture();

    let updated = next();
    edit('docs/foundation/color/palette.mdx', (text) => text.replace('./img/palette.png', './img/sumiu.png'));
    const problems = await updated;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^docs\/foundation\/color\/palette\.mdx:\d+:\d+ +imagem "\.\/img\/sumiu\.png" não encontrada/);
    expect((await get('_systembook/data/nav.json')).status).toBe(200);

    updated = next();
    edit('docs/foundation/color/palette.mdx', (text) => text.replace('./img/sumiu.png', './img/palette.png'));
    expect(await updated).toEqual([]);

    // Config inválida: o servidor mantém a última config boa.
    updated = next();
    edit('systembook.config.ts', (text) => text.replace("name: 'Acme DS'", "name: ''"));
    expect(await updated).toEqual(['systembook.config.ts: "name": é obrigatório']);
    expect((await get('')).status).toBe(200);

    // Salvar conteúdo com a config ainda inválida não esconde o erro dela.
    updated = next();
    edit('docs/foundation/color/palette.mdx', (text) => text.replace('## Cores', '## Cores de novo'));
    expect(await updated).toEqual(['systembook.config.ts: "name": é obrigatório']);

    updated = next();
    edit('systembook.config.ts', (text) => text.replace("name: ''", "name: 'Acme Vivo'"));
    expect(await updated).toEqual([]);
    expect(await (await get('')).text()).toContain('<title>Bem-vindo · Acme Vivo</title>');
  });

  it('idiomas (SYS-171): editar, criar e remover arquivos na pasta do idioma atualiza o site', async () => {
    const write = (root: string, file: string, text: string) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    };
    const { root, first, edit, next, get } = await devFixture((root) => {
      const config = path.join(root, 'systembook.config.ts');
      writeFileSync(
        config,
        readFileSync(config, 'utf8').replace(
          "base: '/acme-ds/',",
          "base: '/acme-ds/',\n  locales: { default: { code: 'en', label: 'English' }, translations: [{ code: 'pt-BR', label: 'Português' }] },",
        ),
      );
      write(root, 'docs-pt-br/foundation/color/palette.mdx', '---\ntitle: Paleta\nslug: paleta\n---\n\n## Cores\n');
    });
    expect(first).toEqual([]);
    expect(await (await get('pt-br/foundation/color/paleta')).text()).toContain('<title>Paleta · Acme DS</title>');
    const page = (file: string) => get(`_systembook/data/locales/pt-br/pages/${file}.json`).then((r) => r.json() as Promise<{ titulo: string; locale: string }>);

    // editar
    let update = next();
    edit('docs-pt-br/foundation/color/palette.mdx', (text) => text.replace('title: Paleta', 'title: Paleta ao vivo'));
    expect(await update).toEqual([]);
    expect((await page('foundation/color/paleta')).titulo).toBe('Paleta ao vivo');

    // criar: a página passa a ser traduzida
    expect((await page('components/actions/button')).locale).toBe('en');
    update = next();
    write(root, 'docs-pt-br/components/actions/button.mdx', '---\ntitle: Botão\n---\n\nOi.\n');
    expect(await update).toEqual([]);
    expect(await page('components/actions/button')).toMatchObject({ titulo: 'Botão', locale: 'pt-BR' });

    // arquivo órfão vira problema com o caminho da pasta do idioma; remover resolve
    update = next();
    write(root, 'docs-pt-br/components/actions/orfa.mdx', '---\ntitle: Órfã\n---\n');
    expect((await update).map((p) => p.split('  ')[0])).toEqual(['docs-pt-br/components/actions/orfa.mdx:1:1']);
    update = next();
    rmSync(path.join(root, 'docs-pt-br/components/actions/orfa.mdx'));
    expect(await update).toEqual([]);
  });
});

