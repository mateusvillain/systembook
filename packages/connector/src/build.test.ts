import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildEntries } from './build.js';
import { discoverPreviews } from './discover.js';
import { generateEntries, type GeneratedEntry } from './generate.js';

const fixtureRoot = fileURLToPath(new URL('../fixtures/sample-repo', import.meta.url));

const ENTRY_NAMES = ['button--primary', 'button--disabled', 'card--default'];

describe('buildEntries', () => {
  it('builda a fixture num artefato estático com refs relativas', { timeout: 120_000 }, async () => {
    // realpath: no macOS o tmpdir é symlink (/var → /private/var) e o rollup
    // resolve os importers pelo caminho real — sem isso o ../ relativo das
    // entradas erra por um nível
    const workDir = await realpath(await mkdtemp(path.join(tmpdir(), 'systembook-build-')));
    const entriesDir = path.join(workDir, 'entries');
    const outDir = path.join(workDir, 'dist');

    const { previews } = await discoverPreviews({ root: fixtureRoot });
    const entries = await generateEntries(previews, { root: fixtureRoot, outDir: entriesDir });
    const result = await buildEntries(entries, { root: fixtureRoot, outDir });

    expect(result.outDir).toBe(outDir);

    for (const name of ENTRY_NAMES) {
      const htmlPath = path.join(outDir, name, 'index.html');
      const html = await readFile(htmlPath, 'utf8');

      // sem tags de módulo TSX cru — o build substituiu pela bundle
      expect(html).not.toContain('index.tsx');

      // toda ref de script/css é relativa e aponta para arquivo existente
      const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(ref.startsWith('/')).toBe(false);
        expect(ref).not.toMatch(/^https?:/);
        await expect(
          access(path.resolve(path.dirname(htmlPath), ref)),
        ).resolves.toBeUndefined();
      }
    }
  });

  it('erro de compilação em uma entrada rejeita o build inteiro', { timeout: 120_000 }, async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'systembook-build-broken-'));
    const entryDir = path.join(workDir, 'entries', 'broken--default');
    await mkdir(entryDir, { recursive: true });
    await writeFile(
      path.join(entryDir, 'index.html'),
      '<!doctype html><html><body><div id="root"></div><script type="module" src="./index.tsx"></script></body></html>',
    );
    await writeFile(
      path.join(entryDir, 'index.tsx'),
      "import { naoExiste } from './modulo-inexistente.js';\nnaoExiste();\n",
    );
    const entries: GeneratedEntry[] = [
      { componentName: 'Broken', variantId: 'default', entryDir },
    ];

    await expect(
      buildEntries(entries, { root: workDir, outDir: path.join(workDir, 'dist') }),
    ).rejects.toThrow(/build Vite falhou/);
  });

  it('lista vazia de entradas é erro imediato', async () => {
    await expect(buildEntries([], { root: fixtureRoot })).rejects.toThrow(/nenhuma entrada/);
  });
});
