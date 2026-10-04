import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { InstanceImport } from '@systembook/schema';
import { loadConfig } from '../config.js';
import { buildImportPayload, ImportError, importProject } from './index.js';

const TMP = fileURLToPath(new URL('../../.tmp', import.meta.url));
mkdirSync(TMP, { recursive: true });
const temps: string[] = [];
afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const ORIGIN = 'https://docs.acme.dev';
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('x')]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';

/** Projeto pequeno: landing, uma página com tab, imagem e links entre elas. */
function project(files: Record<string, string | Buffer> = {}): string {
  const root = mkdtempSync(path.join(TMP, 'import-'));
  temps.push(root);
  const all: Record<string, string | Buffer> = {
    'systembook.config.json': JSON.stringify({
      name: 'Acme DS',
      logo: './brand/logo.svg',
      statusTags: [{ titulo: 'Stable', cor: '#2e7d32' }],
    }),
    'brand/logo.svg': SVG,
    'docs/index.mdx': 'Comece pelo [botão](./componentes/acoes/button/index.mdx).\n',
    'docs/componentes/_menu.yml': 'title: Componentes\n',
    'docs/componentes/acoes/_section.yml': 'title: Ações\n',
    'docs/componentes/acoes/button/index.mdx': [
      '---',
      'title: Button',
      'subtitle: Dispara uma ação.',
      'status: Stable',
      '---',
      '',
      '![Botão](./botao.png "Legenda")',
      '',
      'Veja o [uso](./usage.mdx#regras) e o [link](../link.mdx).',
      '',
    ].join('\n'),
    'docs/componentes/acoes/button/usage.mdx': '---\ntitle: Usage\n---\n\nUso.\n',
    'docs/componentes/acoes/button/botao.png': PNG,
    'docs/componentes/acoes/link.mdx': '---\ntitle: Link\n---\n\n![Externa](https://cdn.example.com/x.png)\n',
    ...files,
  };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

/** Texto dos links e `src` das imagens de um doc, na ordem. */
function addresses(doc: unknown): string[] {
  const found: string[] = [];
  JSON.stringify(doc, (key, value) => {
    if ((key === 'href' || key === 'src') && typeof value === 'string') found.push(value);
    return value;
  });
  return found;
}

/** Instância falsa: guarda o que recebeu e responde como o tRPC. */
function fakeInstance(response: { status: number; body: unknown }) {
  const calls: { url: string; method?: string; auth: string | null; body: InstanceImport }[] = [];
  const fetch = (async (input: URL | string, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      auth: new Headers(init?.headers).get('authorization'),
      body: JSON.parse(String(init?.body)) as InstanceImport,
    });
    return new Response(JSON.stringify(response.body), { status: response.status });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const OK = {
  status: 200,
  body: { result: { data: { created: { menus: 1, sections: 1, pages: 2 }, replaced: 0, images: 1, settingsApplied: true } } },
};

describe('systembook import', { timeout: 60_000 }, () => {
  it('monta o payload com a árvore, os docs com endereços da instância, as imagens e a config', async () => {
    const { payload, warnings } = await buildImportPayload(await loadConfig(project()));
    expect(warnings).toEqual([]);
    expect(payload.version).toBe(1);
    expect(payload.overwrite).toBe(false);
    expect(payload.settings).toEqual({
      nome: 'Acme DS',
      logo: { mime: 'image/svg+xml', base64: Buffer.from(SVG).toString('base64') },
      logoDark: null,
      statusTags: [{ titulo: 'Stable', cor: '#2e7d32' }],
    });

    const [menu] = payload.menus;
    expect(menu).toMatchObject({ titulo: 'Componentes', slug: 'componentes' });
    const [section] = menu!.sections;
    expect(section).toMatchObject({ titulo: 'Ações', slug: 'acoes' });
    const [button, linkPage] = section!.pages;
    expect(button).toMatchObject({ titulo: 'Button', slug: 'button', subtitulo: 'Dispara uma ação.', status: 'Stable' });
    expect(button!.tabs.map(({ titulo, slug }) => ({ titulo, slug }))).toEqual([{ titulo: 'Usage', slug: 'usage' }]);
    expect(linkPage).toMatchObject({ titulo: 'Link', slug: 'link', status: null });

    // Links viram URLs da doc da instância (a tab pelo slug, que a instância
    // troca pelo id); imagens do projeto, o caminho que referencia `images`.
    expect(addresses(button!.body)).toEqual([
      'componentes/acoes/button/botao.png',
      '/docs/componentes/acoes/button/usage#regras',
      '/docs/componentes/acoes/link',
    ]);
    expect(addresses(linkPage!.body)).toEqual(['https://cdn.example.com/x.png']);
    expect(addresses(payload.landing)).toEqual(['/docs/componentes/acoes/button']);
    expect(payload.images).toEqual([
      { ref: 'componentes/acoes/button/botao.png', mime: 'image/png', base64: PNG.toString('base64') },
    ]);
  });

  it('envia para a instância com o token e devolve o resumo', async () => {
    const { fetch, calls } = fakeInstance(OK);
    const result = await importProject(await loadConfig(project()), { to: `${ORIGIN}/`, token: 'tok', overwrite: true, fetch });
    expect(result).toMatchObject({ created: { menus: 1, sections: 1, pages: 2 }, warnings: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: `${ORIGIN}/trpc/migration.import`, method: 'POST', auth: 'Bearer tok' });
    expect(calls[0]!.body.overwrite).toBe(true);
  });

  it('conflito: lista o que já existe e sugere --overwrite', async () => {
    const { fetch } = fakeInstance({
      status: 409,
      body: { error: { message: 'a página componentes/acoes/button já existe.\na landing (/docs) já foi publicada.' } },
    });
    const error = await importProject(await loadConfig(project()), { to: ORIGIN, token: 't', fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImportError);
    expect((error as ImportError).problems).toEqual([
      'a página componentes/acoes/button já existe.',
      'a landing (/docs) já foi publicada.',
      'nada foi importado. Para substituir as páginas que já existem, rode de novo com --overwrite.',
    ]);
  });

  it('token recusado e URL inválida viram erro legível', async () => {
    const config = await loadConfig(project());
    await expect(
      importProject(config, { to: ORIGIN, token: 'x', fetch: fakeInstance({ status: 401, body: {} }).fetch }),
    ).rejects.toThrow(/recusou o token/);
    await expect(importProject(config, { to: 'docs.acme', token: 'x' })).rejects.toThrow(/--to precisa ser a URL/);
  });

  it('conteúdo inválido para antes de chegar à instância', async () => {
    const { fetch, calls } = fakeInstance(OK);
    const root = project({ 'docs/componentes/acoes/link.mdx': '---\ntitle: Link\n---\n\n[quebrado](./nao-existe.mdx)\n' });
    await expect(importProject(await loadConfig(root), { to: ORIGIN, token: 't', fetch })).rejects.toThrow(/nao-existe\.mdx/);
    expect(calls).toEqual([]);
  });

  it('logo por URL não vai, com aviso; logo em formato que o CMS não aceita é erro', async () => {
    const byUrl = project({
      'systembook.config.json': JSON.stringify({ name: 'Acme', logo: 'https://cdn.example.com/logo.svg' }),
      'docs/componentes/acoes/button/index.mdx': '---\ntitle: Button\n---\n\nOi.\n',
    });
    const { payload, warnings } = await buildImportPayload(await loadConfig(byUrl));
    expect(payload.settings.logo).toBeNull();
    expect(warnings).toEqual([expect.stringContaining('"logo" é uma URL')]);

    const gif = project({
      'systembook.config.json': JSON.stringify({ name: 'Acme', logo: './brand/logo.gif' }),
      'brand/logo.gif': 'GIF89a',
      'docs/componentes/acoes/button/index.mdx': '---\ntitle: Button\n---\n\nOi.\n',
    });
    await expect(buildImportPayload(await loadConfig(gif))).rejects.toThrow(/PNG, JPEG ou SVG/);
  });
});
