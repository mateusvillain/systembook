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
