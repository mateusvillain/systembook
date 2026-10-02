// @vitest-environment jsdom
import { Editor, getSchema, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { blocksToTiptapDoc, MARK_ORDER, parseDocument, tiptapDocToBlocks } from '@systembook/content';
import { contentExtensions } from './extensions.js';

/**
 * O parser de arquivos (`@systembook/content`) promete produzir o mesmo JSON
 * que o editor do CMS produz (SYS-93). A prova fica aqui, onde está o schema
 * real: a saída do parser é carregada num `Editor` com o conjunto de conteúdo
 * e tem que voltar idêntica pelo `getJSON()` — attrs padrão, ordem dos marks e
 * texto fundido incluídos — e ser válida no schema (aninhamento).
 */
const FIXTURE = `---
title: Botão
---

# Botão

Use o **botão **primário**** para a *ação <u>principal</u>* — [ver *tokens*](https://x.dev "Tokens"),
\`--primary\` e [\`Button\`](./button.mdx).

## Variantes

1. Primário
   - com ícone
   - sem ícone

   \`\`\`tsx
   <Button variant="primary" />
   \`\`\`
2. Secundário

- item **forte**

\`\`\`
texto puro
\`\`\`

![Botão primário](./img/botao.png "Estado padrão")

![Sem legenda](https://x.dev/a.png)

| Token | Uso |
| --- | ---: |
| \`--primary\` | **Ação** principal |
| \`--muted\` |  |

### Fim
`;

describe('parser ↔ schema do conteúdo', () => {
  const { doc, diagnostics } = parseDocument(FIXTURE, { file: 'f.mdx', format: 'mdx', kind: 'page' });

  it('o fixture não tem diagnósticos', () => {
    expect(diagnostics).toEqual([]);
  });

  it('a ordem de marks do parser é a do schema', () => {
    expect(Object.keys(getSchema(contentExtensions).marks)).toEqual([...MARK_ORDER]);
  });

  it('é válido no schema', () => {
    const schema = getSchema(contentExtensions);
    expect(() => schema.nodeFromJSON(doc).check()).not.toThrow();
  });

  it('o editor devolve exatamente o mesmo JSON', () => {
    // `TiptapDoc` é o shape mínimo do pacote de conteúdo; o editor tipa com o seu.
    const editor = new Editor({ extensions: contentExtensions, content: doc as JSONContent, editable: false });
    try {
      expect(editor.getJSON()).toEqual(doc);
    } finally {
      editor.destroy();
    }
  });

  it('sobrevive à ida e volta por blocos (o que o snapshot guarda)', () => {
    expect(blocksToTiptapDoc(tiptapDocToBlocks(doc))).toEqual(doc);
  });
});

/**
 * Componentes MDX (SYS-94). Os NodeViews deles são React; o `Editor` puro do
 * core não os monta, mas a normalização que interessa é a do schema — é ela que
 * o editor aplica ao carregar o conteúdo, e o `getJSON()` é o `toJSON()` do doc.
 */
const COMPONENTS = `<Callout variant="warning">
  Evite **duas** ações primárias.

  <Callout>Aninhado numa linha.</Callout>

  <ComponentEmbed component="Button" variant="primary" />

  ![Botão](./b.png "Legenda")

  - item
</Callout>

<DosDonts variant="do" title="Use verbos" coverComponent="Button" coverVariant="primary">
  "Salvar" diz o que acontece.

  | Rótulo | Bom? |
  | --- | :---: |
  | Salvar | sim |
</DosDonts>

<DosDonts variant="dont" coverImage="./x.png" coverAlt="Dois primários">
  Não empilhe.
</DosDonts>

<DosDonts variant="do">Sem cover nem título.</DosDonts>

<ComponentEmbed component="Input" variant="error" />
`;

describe('componentes MDX ↔ schema do conteúdo', () => {
  const { doc, diagnostics } = parseDocument(COMPONENTS, { file: 'c.mdx', format: 'mdx', kind: 'landing' });

  it('o fixture não tem diagnósticos', () => {
    expect(diagnostics).toEqual([]);
  });

  it('é válido no schema e já sai normalizado', () => {
    const node = getSchema(contentExtensions).nodeFromJSON(doc);
    expect(() => node.check()).not.toThrow();
    expect(node.toJSON()).toEqual(doc);
  });

  it('sobrevive à ida e volta por blocos', () => {
    expect(blocksToTiptapDoc(tiptapDocToBlocks(doc))).toEqual(doc);
  });
});

