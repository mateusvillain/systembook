import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { Block, InstanceExport, PageSnapshot } from '@systembook/schema';
import { prepareSite } from '../build/prepare.js';
import { checkSite } from '../check.js';
import { loadConfig } from '../config.js';
import { ExportError, exportProject } from './index.js';

const TMP = fileURLToPath(new URL('../../.tmp', import.meta.url));
mkdirSync(TMP, { recursive: true });
const temps: string[] = [];
afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const tempDir = () => {
  const dir = mkdtempSync(path.join(TMP, 'export-'));
  temps.push(dir);
  return dir;
};

const ORIGIN = 'https://docs.acme.dev';
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

const text = (t: string, marks?: unknown[]) => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const link = (href: string) => ({
  type: 'link',
  attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: null },
});
const block = <T extends Block['type']>(type: T, content: Extract<Block, { type: T }>['content'], ordem: number) =>
  ({ id: `b${ordem}`, tabId: 't', type, content, ordem }) as Block;

/** Um bloco de cada tipo, na forma do editor do CMS. */
const RICH: Block[] = [
  block('heading', { level: 2, body: [text('Uso')] }, 0),
  block('paragraph', { body: [text('Veja o '), text('Link', [link('/docs/componentes/acoes/link')]), text(' e o '), text('código', [link(`${ORIGIN}/docs/componentes/acoes/button/tab-code#props`)]), text('.')] }, 1),
  block('list', { ordered: false, body: { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('item', [{ type: 'bold' }])] }] }] } }, 2),
  block('code', { language: 'typescript', code: 'const a = 1;' }, 3),
  block('image', { src: '/uploads/botao.png', alt: 'Botão', caption: 'Legenda' }, 4),
  block('image', { src: 'https://cdn.example.com/x.png', alt: 'Externa', caption: null }, 5),
  block(
    'table',
    {
      body: {
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [{ type: 'paragraph', content: [text('A')] }] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [{ type: 'paragraph', content: [text('1')] }] }] },
        ],
      },
    },
    6,
  ),
  block('callout', { variant: 'warning', body: [{ type: 'paragraph', content: [text('Cuidado.')] }] }, 7),
  block('component-embed', { componentName: 'Button', variantId: 'primary' }, 8),
  block('dos-donts', { variant: 'do', titulo: 'Use verbos', cover: { kind: 'image', src: `${ORIGIN}/uploads/do.png`, alt: 'Do' }, descricao: [{ type: 'paragraph', content: [text('Salvar.')] }] }, 9),
];

const snapshot = (body: Block[], tabs: { tabId: string; titulo: string; blocks: Block[] }[] = []): PageSnapshot => ({
  tabs: [{ tabId: 'primary', titulo: 'Conteúdo', isPrimary: true, blocks: body }, ...tabs.map((t) => ({ ...t, isPrimary: false }))],
});
const para = (t: string) => [block('paragraph', { body: [text(t)] }, 0)];

const PAYLOAD: InstanceExport = {
  version: 1,
  settings: {
    nome: 'Acme DS',
    logo: { mime: 'image/svg+xml', base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64') },
    logoDark: null,
    statusTags: [{ titulo: 'Stable', cor: '#2e7d32' }],
  },
  landing: snapshot([block('paragraph', { body: [text('Comece pelo '), text('botão', [link('/docs/componentes/acoes/button')]), text('.')] }, 0)]),
  menus: [
    {
      titulo: 'Componentes',
      slug: 'componentes',
      ordem: 0,
      sections: [
        {
          titulo: 'Ações',
          slug: 'acoes',
          ordem: 0,
          pages: [
            {
              titulo: 'Button',
              slug: 'button',
              subtitulo: 'Dispara uma ação.',
              ordem: 0,
              status: 'Stable',
              snapshot: snapshot(RICH, [
                { tabId: 'tab-code', titulo: 'Código', blocks: para('props') },
                { tabId: 'tab-code-2', titulo: 'Código', blocks: para('de novo') },
              ]),
            },
            { titulo: 'Link', slug: 'link', subtitulo: null, ordem: 1, status: null, snapshot: snapshot(para('Link.')) },
          ],
        },
        { titulo: 'Vazia', slug: 'vazia', ordem: 1, pages: [] },
      ],
    },
    { titulo: 'Sem nada', slug: 'sem-nada', ordem: 1, sections: [] },
  ],
  unpublished: [{ menu: 'componentes', section: 'acoes', slug: 'rascunho', titulo: 'Rascunho' }],
};

/** Instância falsa: o export e as imagens hospedadas nela. */
function fakeInstance(payload: unknown = PAYLOAD, status = 200) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetch = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
    if (url.endsWith('/trpc/migration.export')) {
      return new Response(JSON.stringify({ result: { data: payload } }), { status });
    }
    if (url.startsWith(`${ORIGIN}/uploads/`)) return new Response(PNG);
    return new Response('not found', { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('systembook export', { timeout: 60_000 }, () => {
  it('gera um projeto que passa no check e reconstrói os mesmos blocos', async () => {
    const out = path.join(tempDir(), 'projeto');
    const { fetch, calls } = fakeInstance();
    const result = await exportProject({ from: ORIGIN, token: 'tok', out, fetch });

    expect(calls[0]).toEqual({ url: `${ORIGIN}/trpc/migration.export`, auth: 'Bearer tok' });
    expect(result.pages).toBe(2);
    expect(result.images).toBe(2);
    expect(result.unpublished).toEqual(PAYLOAD.unpublished);
    expect(result.warnings).toEqual([]);

    const file = (p: string) => readFileSync(path.join(out, p), 'utf8');
    expect(file('docs/componentes/_menu.yml')).toBe('title: Componentes\norder: 0\n');
    expect(file('docs/componentes/acoes/_section.yml')).toBe('title: Ações\norder: 0\n');
    expect(file('docs/componentes/acoes/button/index.mdx')).toMatch(/^---\ntitle: Button\nsubtitle: Dispara uma ação\.\norder: 0\nstatus: Stable\n---\n/);
    // Tabs com o mesmo título ganham slugs distintos.
    expect(file('docs/componentes/acoes/button/codigo.mdx')).toContain('title: Código');
    expect(existsSync(path.join(out, 'docs/componentes/acoes/button/codigo-2.mdx'))).toBe(true);
    expect(file('docs/componentes/acoes/link.mdx')).toContain('title: Link');
    // Menus e seções sem página publicada não viram pasta.
    expect(existsSync(path.join(out, 'docs/sem-nada'))).toBe(false);
    expect(existsSync(path.join(out, 'docs/componentes/vazia'))).toBe(false);
    // Links internos viram caminhos relativos; imagens da instância são baixadas.
    const body = file('docs/componentes/acoes/button/index.mdx');
    expect(body).toContain('[Link](../link.mdx)');
    expect(body).toContain('[código](./codigo.mdx#props)');
    expect(body).toContain('![Botão](../../../_images/botao.png "Legenda")');
    expect(body).toContain('https://cdn.example.com/x.png');
    expect(body).toContain('coverImage="../../../_images/do.png"');
    expect(file('docs/index.mdx')).toContain('[botão](./componentes/acoes/button/index.mdx)');
    expect(readFileSync(path.join(out, 'docs/_images/botao.png'))).toEqual(PNG);
    expect(file('systembook.config.ts')).toContain('logo: "./brand/logo.svg"');

    const config = await loadConfig(out);
    expect(await checkSite(config)).toMatchObject({ ok: true, pages: 2 });

    // O site estático tem os mesmos blocos do CMS — fora os endereços
    // reescritos (links e imagens), que o build resolve para URLs do site.
    const { site } = await prepareSite(config);
    const page = site.data.pages['componentes/acoes/button']!;
    const types = (blocks: { type: string }[]) => blocks.map((b) => b.type);
    expect(types(page.snapshot!.tabs[0]!.blocks)).toEqual(types(RICH));
    const strip = (blocks: Block[]) =>
      JSON.parse(JSON.stringify(blocks.map(({ type, content }) => ({ type, content }))).replace(/"(href|src)":"[^"]*"/g, '"$1":"…"'));
    expect(strip(page.snapshot!.tabs[0]!.blocks)).toEqual(strip(RICH));
    expect(page.snapshot!.tabs.slice(1).map((t) => t.titulo)).toEqual(['Código', 'Código']);
    expect(page.subtitulo).toBe('Dispara uma ação.');
  });

  it('não escreve em pasta com arquivos sem --force', async () => {
    const out = tempDir();
    writeFileSync(path.join(out, 'README.md'), 'meu');
    await expect(exportProject({ from: ORIGIN, token: 'tok', out, fetch: fakeInstance().fetch })).rejects.toThrow(/--force/);
    await exportProject({ from: ORIGIN, token: 'tok', out, force: true, fetch: fakeInstance().fetch });
    expect(readFileSync(path.join(out, 'README.md'), 'utf8')).toBe('meu');
    expect(existsSync(path.join(out, 'systembook.config.ts'))).toBe(true);
  });

  it('token recusado, URL inválida e resposta que não é export viram erro legível', async () => {
    const out = path.join(tempDir(), 'x');
    await expect(exportProject({ from: ORIGIN, token: 'x', out, fetch: fakeInstance(PAYLOAD, 401).fetch })).rejects.toThrow(
      /recusou o token/,
    );
    await expect(exportProject({ from: 'docs.acme', token: 'x', out })).rejects.toBeInstanceOf(ExportError);
    await expect(exportProject({ from: ORIGIN, token: 'x', out, fetch: fakeInstance({ version: 9 }).fetch })).rejects.toThrow(
      /não é um export/,
    );
    expect(existsSync(out)).toBe(false);
  });

  it('avisa o que não pôde ser resolvido: link para página não exportada e imagem que falhou', async () => {
    const payload: InstanceExport = {
      ...PAYLOAD,
      landing: snapshot([
        block('paragraph', { body: [text('x', [link('/docs/componentes/acoes/rascunho')])] }, 0),
        block('image', { src: '/sumiu.png', alt: 'a', caption: null }, 1),
      ]),
    };
    const out = path.join(tempDir(), 'p');
    const result = await exportProject({ from: ORIGIN, token: 't', out, fetch: fakeInstance(payload).fetch });
    expect(result.warnings).toEqual([
      expect.stringMatching(/^docs\/index\.mdx: o link "\/docs\/componentes\/acoes\/rascunho"/),
      expect.stringMatching(/^docs\/_images\/sumiu\.png: não foi possível baixar/),
    ]);
  });
});
