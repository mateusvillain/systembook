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

    // manifest.json mapeia slug do diretório → par canônico (para o CI)
    const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8')) as {
      component: string;
      variantId: string;
      entryDir: string;
    }[];
    expect(manifest.map((m) => m.entryDir).sort()).toEqual([...ENTRY_NAMES].sort());
    expect(manifest.find((m) => m.entryDir === 'button--primary')).toEqual({
      component: 'Button',
      variantId: 'primary',
      entryDir: 'button--primary',
    });

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

    // preview-config.json por variante (TASK-49), ao lado do index.html
    const cfg = JSON.parse(
      await readFile(path.join(outDir, 'button--primary', 'preview-config.json'), 'utf8'),
    ) as { component: string; controls: { kind: string; propName: string }[] };
    expect(cfg.component).toBe('Button');
    expect(cfg.controls.some((c) => c.kind === 'boolean')).toBe(true);
    expect(cfg.controls.some((c) => c.kind === 'select')).toBe(true);
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
      {
        componentName: 'Broken',
        variantId: 'default',
        entryDir,
        config: { component: 'Broken', variants: [], controls: [] },
      },
    ];

    await expect(
      buildEntries(entries, { root: workDir, outDir: path.join(workDir, 'dist') }),
    ).rejects.toThrow(/build Vite falhou/);
  });

  it('lista vazia de entradas é erro imediato', async () => {
    await expect(buildEntries([], { root: fixtureRoot })).rejects.toThrow(/nenhuma entrada/);
  });
});
