# @systembook/content

O conteúdo do [SystemBook](https://github.com/mateusvillain/systembook) em
arquivos: o parser de `.md`/`.mdx` para os blocos do CMS, a árvore de navegação
a partir das pastas e os dados do site estático.

Quem usa o modo estático não precisa deste pacote diretamente: ele é a base do
[`@systembook/cli`](https://www.npmjs.com/package/@systembook/cli)
(`systembook build`, `check` e `dev`). Ele é publicado à parte para ferramentas
que queiram ler o mesmo formato.

O formato (pastas, frontmatter, blocos e componentes MDX) está em
[`docs/static-format.md`](https://github.com/mateusvillain/systembook/blob/main/docs/static-format.md).

## Entradas

| Import | O que tem |
| --- | --- |
| `@systembook/content` | `parseDocument` (um arquivo → blocos + referências + diagnósticos), `buildContentTree` (arquivos → menus, seções, páginas e tabs), `buildSiteData`/`siteDataFiles` (árvore → JSONs do site), o índice de busca e os schemas de frontmatter |
| `@systembook/content/node` | `readContentDir`: lê a pasta de conteúdo do disco (só Node) |
| `@systembook/content/blocks` | O mapeamento canônico entre nós Tiptap e blocos (`nodeToBlock`, `blockToNode`) |
| `@systembook/content/site` | Caminhos dos dados do site e a consulta ao índice de busca, leves o bastante para o navegador |

```ts
import { buildContentTree, formatDiagnostic } from '@systembook/content';
import { readContentDir } from '@systembook/content/node';

const tree = buildContentTree(await readContentDir('docs'), { statusTags: ['Stable'] });
for (const diagnostic of tree.diagnostics) console.error(formatDiagnostic(diagnostic));
```

Todo problema vira um `Diagnostic` com arquivo, linha e coluna; nada é
descartado em silêncio.

## Licença

MIT
