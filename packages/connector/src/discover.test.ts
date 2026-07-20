import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverPreviews } from './discover.js';

const fixtureRoot = fileURLToPath(new URL('../fixtures/sample-repo', import.meta.url));

describe('discoverPreviews', () => {
  it('descobre os válidos, reporta o malformado e ignora node_modules', async () => {
    const { previews, failures } = await discoverPreviews({ root: fixtureRoot });

    expect(previews).toHaveLength(2);
    expect(previews.map((p) => p.config.component)).toEqual(['Button', 'Card']);
    expect(previews.map((p) => path.relative(fixtureRoot, p.filePath))).toEqual([
      'src/button.preview.tsx',
      'src/nested/card.preview.tsx',
    ]);

    // configs completos sobrevivem ao round-trip bundle → import → zod
    const button = previews[0]!.config;
    expect(button.variants.map((v) => v.id)).toEqual(['primary', 'disabled']);
    expect(button.controls).toHaveLength(3);
    expect(button.variants[0]?.props).toEqual({ variant: 'primary', children: 'Salvar' });

    expect(failures).toHaveLength(1);
    expect(failures[0]?.filePath).toContain('broken.preview.tsx');
    expect(failures[0]?.message).toContain('PreviewConfig');
    expect(failures[0]?.message).toContain('variants');

    // ignored.preview.tsx dentro de node_modules não aparece em lugar nenhum
    const allPaths = [...previews, ...failures].map((entry) => entry.filePath);
    expect(allPaths.some((p) => p.includes('node_modules'))).toBe(false);
  });

  it('raiz sem previews retorna listas vazias', async () => {
    const emptyRoot = fileURLToPath(new URL('.', import.meta.url));
    const { previews, failures } = await discoverPreviews({ root: emptyRoot });
    expect(previews).toEqual([]);
    expect(failures).toEqual([]);
  });
});
