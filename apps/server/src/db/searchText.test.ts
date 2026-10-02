import { describe, expect, it } from 'vitest';
import type { PageSnapshot } from '@systembook/schema';
import { blockPlainText, extractSearchableText } from './search.js';

/**
 * Paridade com a regra canônica de "texto do bloco" de `@systembook/content`
 * (SYS-101), que o build do modo estático usa para o índice de busca. O server
 * mantém a própria cópia (roda compilado em produção e não importa pacotes de
 * workspace em runtime); este teste é o que impede as duas de divergirem — e
 * a mesma página de ser achada num modo e não no outro.
 */
describe('paridade da busca com @systembook/content', () => {
  it('mesmo texto por bloco e por snapshot, para todos os tipos', async () => {
    const content = await import('@systembook/content');
    const source = [
      '---',
      'title: T',
      '---',
      '',
      '## Cores **primárias**',
      '',
      'Um parágrafo com [link](https://x.dev) e `código`.',
      '',
      '- item um',
      '  - item dois',
      '',
      '```ts',
      'const segredo = 1',
      '```',
      '',
      '![Paleta](./p.png "Legenda")',
      '',
      '| Token | Uso |',
      '| --- | --- |',
      '| primary | ação |',
      '',
      '<Callout variant="tip">Dica <u>sublinhada</u>.</Callout>',
      '',
      '<ComponentEmbed component="Button" variant="primary" />',
      '',
      '<DosDonts variant="do" title="Verbo">Use verbos.</DosDonts>',
    ].join('\n');
    const parsed = content.parseDocument(source, { file: 'p.mdx', format: 'mdx', kind: 'tab' });
    expect(parsed.diagnostics).toEqual([]);
    const blocks = content.tiptapDocToBlocks(parsed.doc);
    expect(new Set(blocks.map((b) => b.type)).size).toBe(9);

    for (const block of blocks) {
      expect(blockPlainText(block.type, block.content), block.type).toBe(content.blockPlainText(block.type, block.content));
    }
    const snapshot = {
      tabs: [{ tabId: 't', titulo: 'T', isPrimary: true, blocks: blocks.map((b, i) => ({ ...b, id: `${i}`, tabId: 't' })) }],
    } as PageSnapshot;
    expect(extractSearchableText(snapshot)).toBe(content.extractSearchableText(snapshot));
    expect(extractSearchableText(snapshot)).toContain('Cores primárias');
  });
});
