import { describe, expect, it } from 'vitest';
import {
  blocksToTiptapDoc,
  tiptapDocToBlocks,
  UnknownNodeTypeError,
  type TiptapDoc,
  type TiptapNode,
} from './serialize.js';

const text = (t: string, marks?: unknown[]): TiptapNode =>
  marks ? { type: 'text', text: t, marks } : { type: 'text', text: t };

/**
 * Um nó top-level de cada um dos 8 tipos do MVP, com os detalhes que já
 * derrubariam um mapeamento ingênuo: marks inline, attrs de lista (start),
 * colwidth de tabela, callout aninhando dois blocos.
 */
const FULL_DOC: TiptapDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [text('Uso')] },
    { type: 'paragraph', content: [text('Olá '), text('mundo', [{ type: 'bold' }])] },
    {
      type: 'orderedList',
      attrs: { start: 3, type: null },
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('item')] }] },
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'typescript' },
      content: [text('const x = 1;\nconst y = 2;')],
    },
    { type: 'image', attrs: { src: '/uploads/a.png', alt: 'Botão', caption: null } },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              attrs: { colspan: 1, rowspan: 1, colwidth: [120], align: null },
              content: [{ type: 'paragraph', content: [text('Col')] }],
            },
          ],
        },
      ],
    },
    {
      type: 'callout',
      attrs: { variant: 'warning' },
      content: [
        { type: 'paragraph', content: [text('Cuidado')] },
        { type: 'codeBlock', attrs: { language: null }, content: [text('rm -rf')] },
      ],
    },
    { type: 'componentEmbed', attrs: { componentName: 'Button', variantId: null } },
    {
      type: 'dosDonts',
      attrs: { variant: 'do', titulo: 'Use espaçamento consistente', cover: null },
      content: [{ type: 'paragraph', content: [text('Alinhe os elementos à grade de 8px')] }],
    },
  ],
};

describe('serialização doc ↔ blocks (TASK-31)', () => {
  it('round-trip dos 9 tipos preserva o doc (inclusive via JSON de banco)', () => {
    const inserts = tiptapDocToBlocks(FULL_DOC, 'tab-1');
    expect(inserts.map((b) => b.tipo)).toEqual([
      'heading',
      'paragraph',
      'list',
      'code',
      'image',
      'table',
      'callout',
      'component-embed',
      'dos-donts',
    ]);
    expect(inserts.map((b) => b.ordem)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(inserts.every((b) => b.tabId === 'tab-1')).toBe(true);

    // simula a ida e volta pelo banco: conteudo vira string e volta
    const stored = inserts.map((b) => ({
      tipo: b.tipo,
      conteudo: JSON.parse(JSON.stringify(b.conteudo)),
      ordem: b.ordem,
    }));
    expect(blocksToTiptapDoc(stored)).toEqual(FULL_DOC);
  });

  it('bulletList e orderedList mapeiam ambos para tipo "list" e voltam distintos', () => {
    const doc: TiptapDoc = {
      type: 'doc',
      content: [
        { type: 'bulletList', content: [] },
        { type: 'orderedList', attrs: { start: 1 }, content: [] },
      ],
    };
    const inserts = tiptapDocToBlocks(doc, 'tab-1');
    expect(inserts.map((b) => b.tipo)).toEqual(['list', 'list']);
    expect(inserts.map((b) => b.tipo === 'list' && b.conteudo.ordered)).toEqual([false, true]);
    expect(blocksToTiptapDoc(inserts)).toEqual(doc);
  });

  it('blocksToTiptapDoc ordena por ordem, independente da ordem de entrada', () => {
    const inserts = tiptapDocToBlocks(FULL_DOC, 'tab-1');
    const shuffled = [...inserts].reverse();
    expect(blocksToTiptapDoc(shuffled)).toEqual(FULL_DOC);
  });

  it('doc vazio e parágrafo vazio round-trippam', () => {
    expect(blocksToTiptapDoc(tiptapDocToBlocks({ type: 'doc' }, 't'))).toEqual({
      type: 'doc',
      content: [],
    });
    const emptyParagraph: TiptapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
    const stored = tiptapDocToBlocks(emptyParagraph, 't').map((b) => ({
      ...b,
      conteudo: JSON.parse(JSON.stringify(b.conteudo)),
    }));
    expect(blocksToTiptapDoc(stored)).toEqual(emptyParagraph);
  });

  it('dos-donts round-trippa os 3 tipos de cover (imagem, component-embed, sem cover) (TASK-71)', () => {
    const withImageCover: TiptapNode = {
      type: 'dosDonts',
      attrs: {
        variant: 'do',
        titulo: 'Use contraste suficiente',
        cover: { kind: 'image', src: '/uploads/contraste.png', alt: 'Exemplo com bom contraste' },
      },
      content: [{ type: 'paragraph', content: [] }],
    };
    const withEmbedCover: TiptapNode = {
      type: 'dosDonts',
      attrs: {
        variant: 'dont',
        titulo: 'Não desabilite o foco visível',
        cover: { kind: 'component-embed', componentName: 'Button', variantId: 'disabled' },
      },
      content: [{ type: 'paragraph', content: [] }],
    };
    const withoutCover: TiptapNode = {
      type: 'dosDonts',
      attrs: { variant: 'do', titulo: 'Sem cover', cover: null },
      content: [{ type: 'paragraph', content: [] }],
    };

    for (const node of [withImageCover, withEmbedCover, withoutCover]) {
      const doc: TiptapDoc = { type: 'doc', content: [node] };
      const inserts = tiptapDocToBlocks(doc, 'tab-1');
      expect(inserts).toHaveLength(1);
      expect(inserts[0]?.tipo).toBe('dos-donts');
      // simula a ida e volta pelo banco (stringify/parse do conteudo_json)
      const stored = inserts.map((b) => ({
        tipo: b.tipo,
        conteudo: JSON.parse(JSON.stringify(b.conteudo)),
        ordem: b.ordem,
      }));
      expect(blocksToTiptapDoc(stored)).toEqual(doc);
    }
  });

  it('nó top-level desconhecido lança UnknownNodeTypeError', () => {
    expect(() =>
      tiptapDocToBlocks({ type: 'doc', content: [{ type: 'iframe' }] }, 't'),
    ).toThrow(UnknownNodeTypeError);
  });
});
