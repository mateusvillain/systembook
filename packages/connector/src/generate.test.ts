import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { discoverPreviews, type DiscoveredPreview } from './discover.js';
import { generateEntries } from './generate.js';

const fixtureRoot = fileURLToPath(new URL('../fixtures/sample-repo', import.meta.url));

let previews: DiscoveredPreview[];

beforeAll(async () => {
  ({ previews } = await discoverPreviews({ root: fixtureRoot }));
});

async function freshOutDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'systembook-entries-'));
}

describe('generateEntries', () => {
  it('gera um diretório por variante com index.tsx e index.html corretos', async () => {
    const outDir = await freshOutDir();
    const entries = await generateEntries(previews, { root: fixtureRoot, outDir });

    expect(entries.map((e) => path.basename(e.entryDir)).sort()).toEqual([
      'button--disabled',
      'button--primary',
      'card--default',
    ]);

    const tsx = await readFile(path.join(outDir, 'button--primary', 'index.tsx'), 'utf8');
    expect(tsx).toContain("import config, { Preview } from '");
    expect(tsx).toContain('button.preview.tsx');
    expect(tsx).toContain("import { mount } from '@systembook/preview-kit'");
    expect(tsx).toContain('variantId: "primary"');

    // o caminho relativo gerado resolve de volta para o arquivo original
    const importPath = /from '([^']+button\.preview\.tsx)'/.exec(tsx)?.[1];
    expect(importPath).toBeDefined();
    expect(path.resolve(path.join(outDir, 'button--primary'), importPath!)).toBe(
      path.join(fixtureRoot, 'src', 'button.preview.tsx'),
    );

    const html = await readFile(path.join(outDir, 'button--primary', 'index.html'), 'utf8');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<script type="module" src="./index.tsx"></script>');
    expect(html).toContain('<title>Button — Primary</title>');
  });

  it('limpa entradas órfãs de execuções anteriores (idempotente)', async () => {
    const outDir = await freshOutDir();
    const staleDir = path.join(outDir, 'removido--stale');
    await mkdir(staleDir, { recursive: true });
    await writeFile(path.join(staleDir, 'index.tsx'), '// órfão');

    const first = await generateEntries(previews, { root: fixtureRoot, outDir });
    const second = await generateEntries(previews, { root: fixtureRoot, outDir });

    expect(second.map((e) => e.entryDir).sort()).toEqual(first.map((e) => e.entryDir).sort());
    const dirs = await readdir(outDir);
    expect(dirs.sort()).toEqual(['button--disabled', 'button--primary', 'card--default']);
  });

  it('nomes de diretório em colisão produzem erro claro', async () => {
    const outDir = await freshOutDir();
    const clashing: DiscoveredPreview[] = [
      {
        filePath: path.join(fixtureRoot, 'src', 'a.preview.tsx'),
        config: {
          component: 'Botao Legal',
          variants: [{ id: 'default', label: 'Default', props: {} }],
          controls: [],
        },
      },
      {
        filePath: path.join(fixtureRoot, 'src', 'b.preview.tsx'),
        config: {
          component: 'botao-legal',
          variants: [{ id: 'default', label: 'Default', props: {} }],
          controls: [],
        },
      },
    ];

    await expect(generateEntries(clashing, { root: fixtureRoot, outDir })).rejects.toThrow(
      /entrada duplicada "botao-legal--default"/,
    );
  });
});
