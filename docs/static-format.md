# Formato de conteúdo do modo estático

Este documento é a referência do **modo estático** do SystemBook: a documentação
escrita em arquivos `.md`/`.mdx` dentro do repositório do design system e
transformada em site estático pelo CLI (`@systembook/cli`). É o contrato que o
parser (`@systembook/content`) implementa. Se os dois divergirem, o parser e os
testes dele são a fonte da verdade, e este documento precisa ser corrigido.

O modo estático entrega a mesma doc pública do modo CMS: mesmos blocos, mesmo
visual e mesmos previews de componente. Por isso o formato só aceita o que o
CMS consegue representar, e qualquer coisa fora dele **falha o build** com
`arquivo:linha:coluna`. Nada é descartado em silêncio.

## Decisões

Fechadas no PRD do modo estático (Linear, projeto "Modo estático", §9):

1. Conteúdo em `docs/` (configurável por `contentDir`) e configuração em
   `systembook.config.{ts,js,mjs,json}`.
2. O parser vive no pacote `@systembook/content`, compartilhado pelo CLI, pelo
   export/import e pelo server.
3. `status` referencia uma lista fechada de tags definida na config.
4. No modo estático as rotas ficam na raiz do site.
5. Importar arquivos numa instância CMS (`systembook import`) **falha** se um
   slug já existir, listando os conflitos; sobrescrever exige `--overwrite`.

Dois recursos do formato dependem de o renderer ganhar suporte: **imagem como
bloco** e **código inline**. Hoje o conjunto de conteúdo não tem nó `image` nem
mark `code`, e a SYS-93 acrescenta os dois, que passam a renderizar também no
modo CMS.

## Estrutura de pastas

A hierarquia vem das pastas e espelha o modelo do CMS
(`Menu → Seção → Página → Tab`):

```
docs/                              # contentDir (configurável)
├── index.mdx                      # landing — opcional
├── foundation/                    # menu
│   ├── _menu.yml                  # opcional: título e ordem do menu
│   └── color/                     # seção
│       ├── _section.yml           # opcional: título e ordem da seção
│       ├── palette.mdx            # página sem tabs
│       └── tokens/                # página com tabs
│           ├── index.mdx          # corpo da página (tab "Overview")
│           ├── usage.mdx          # tab
│           └── code.mdx           # tab
└── components/
    └── actions/
        └── button.mdx
```

| Nível | O que é | Onde |
| --- | --- | --- |
| 1 | Menu | pasta direta de `docs/` |
| 2 | Seção | pasta dentro de um menu |
| 3 | Página | arquivo `.md`/`.mdx` dentro de uma seção, **ou** pasta com `index.mdx` |
| 4 | Tab | arquivo dentro da pasta de uma página, além do `index.mdx` |

Regras:

- `docs/index.mdx` (ou `.md`) é a landing, a raiz do site. Sem ele, a doc
  mostra a landing padrão, com um link para a primeira página.
- Arquivo `.md`/`.mdx` solto na raiz (fora o `index`) ou dentro de um menu
  (fora de uma seção) é erro: toda página precisa de menu e seção.
- Uma página com pasta precisa ter `index.mdx`/`index.md`; os outros arquivos da
  pasta viram tabs. Subpasta dentro da pasta de uma página é erro.
- Arquivos e pastas que começam com `_` ou `.` são ignorados, exceto
  `_menu.yml` e `_section.yml`.
- Menus e seções sem nenhuma página não aparecem (igual ao CMS).

## Slugs e URLs

O slug de cada nível é o **nome da pasta ou do arquivo**, sem extensão. Ele
precisa casar com `^[a-z0-9]+(-[a-z0-9]+)*$`: minúsculas, dígitos e hífens
simples entre eles (`get-started`, `button-group`). Nome fora disso é erro.
Renomeie, ou defina `slug` no frontmatter (páginas e tabs) ou no
`_menu.yml`/`_section.yml` (menus e seções).

As URLs ficam na raiz do site, sob o `base` de publicação:

```
/                                      landing
/foundation/color/palette              página
/foundation/color/tokens/usage         tab de página
```

No modo estático, o id de uma tab é o slug dela (`usage`), não um UUID como
no CMS. `index` é reservado ao corpo da página e não pode ser slug de tab.

Slug repetido no mesmo nível é erro (duas páginas `button` na mesma seção,
`button.mdx` e `button/` juntos, duas tabs com o mesmo slug na mesma página).

## Frontmatter

YAML no topo de cada arquivo de página ou tab.

```mdx
---
title: Palette
subtitle: As cores base do sistema e quando usar cada uma.
order: 1
status: Stable
---
```

| Campo | Tipo | Onde | O que é |
| --- | --- | --- | --- |
| `title` | string, **obrigatório** | página, tab | Título exibido. Na tab, é o rótulo dela. |
| `subtitle` | string | página (`index` da pasta, se tiver tabs) | Introdução abaixo do título. |
| `order` | inteiro | página, tab | Ordem dentro do nível (menor primeiro). No `index` de uma pasta, ordena a página. |
| `status` | string | página | `titulo` de uma tag de `statusTags` da config. |
| `slug` | string | página, tab | Sobrescreve o slug vindo do nome do arquivo. |

Campo desconhecido, tipo errado, `title` ausente e `status` que não existe na
config são erros. `subtitle` e `status` em arquivo de tab são erro.

O `status` é metadado da página: o build o valida e o leva adiante, mas a doc
pública não o exibe hoje, igual ao modo CMS.

Na landing (`docs/index.mdx`) o frontmatter é opcional e aceita só `title`, que
vira o `<title>` do HTML. Qualquer outro campo é erro.

O corpo da página (o `index` de uma pasta com tabs, ou o arquivo de uma página
sem tabs) aparece como a visão **Overview**, sempre a primeira, igual ao CMS.
As tabs vêm depois, na ordem da regra abaixo.

## `_menu.yml` e `_section.yml`

```yaml
title: Foundation   # opcional; padrão: slug humanizado ("get-started" → "Get started")
order: 1            # opcional
slug: foundation    # opcional; padrão: nome da pasta
```

## Ordenação

Em todo nível: primeiro por `order` (os itens sem `order` vão depois dos
que têm), depois pelo slug em ordem alfabética.

## Blocos

O corpo de cada arquivo é Markdown (CommonMark + tabelas GFM). Em `.mdx`
também são aceitos os componentes da seção seguinte.

| Markdown | Vira |
| --- | --- |
| `# Título` a `### Título` | heading níveis 1 a 3 |
| parágrafo | paragraph |
| `- item` / `1. item` | lista (o número inicial é preservado) |
| ` ```ts ` … ` ``` ` | bloco de código; a info string é a linguagem |
| `![alt](./imagem.png "legenda")` sozinho num parágrafo | imagem (`src`, `alt`, `caption`) |
| tabela GFM | tabela; a primeira linha vira cabeçalho |

Marks inline:

| Markdown | Vira |
| --- | --- |
| `**negrito**` | bold |
| `*itálico*` | italic |
| `` `código` `` | código inline |
| `[texto](url)` | link |
| `<u>texto</u>` (só `.mdx`) | sublinhado |

Itens de lista começam por um parágrafo e podem conter, indentados, os mesmos
blocos do corpo da página (outra lista, código, imagem, componentes MDX), como
no editor do CMS.

Linguagem do bloco de código: a info string é usada em minúsculas, e os
apelidos comuns viram o nome que o realce de sintaxe conhece (`ts`/`tsx` →
`typescript`, `js`/`jsx` → `javascript`, `html` → `xml`, `sh` → `bash`, `yml`
→ `yaml`, `md` → `markdown`). Outros nomes são mantidos como estão e exibidos
sem realce. Sem info string, o bloco é texto puro.

Imagens: são sempre um bloco. A imagem precisa estar sozinha no parágrafo, e
pode ficar em qualquer lugar que aceite blocos (corpo, item de lista, callout,
dos-donts). Imagem com texto no mesmo parágrafo, ou dentro de célula de tabela,
é erro. O caminho relativo é resolvido a partir do arquivo, e o build copia a
imagem para o site. Imagem que não existe é erro. URL absoluta (`https://…`) é
mantida como está.

Links:
- URL absoluta e `#âncora` sozinha são mantidas como estão.
- Link relativo para outro `.md`/`.mdx` vira a URL daquele destino: o arquivo
  de página leva à página, o `index` de uma pasta leva à página dela, e o
  arquivo de tab leva à tab. Uma `#âncora` no fim é preservada.
- Link relativo para arquivo que não existe, ou que não é página/tab, é erro.

**Não suportado** (erro, com a sugestão do que usar):

| Markdown | Por quê / alternativa |
| --- | --- |
| `####` a `######` | o CMS só tem 3 níveis; use até `###` |
| `~~tachado~~` | sem equivalente no CMS |
| `> citação` | use `<Callout>` |
| `---` (linha horizontal) | sem equivalente no CMS; use um heading |
| quebra de linha forçada (dois espaços ou `\` no fim da linha) | use um parágrafo novo |
| lista de tarefas (`- [ ]`) | sem equivalente no CMS |
| HTML cru (`<div>`, `<br>`…) | use Markdown ou os componentes abaixo |
| notas de rodapé, definições de link | sem equivalente no CMS |

Quebras de linha simples dentro de um parágrafo (sem os dois espaços) seguem
o Markdown e viram espaço.

## Componentes MDX

Só em arquivos `.mdx`. **Lista fechada**, com **props literais**: string entre
aspas, sem `{expressões}`. Qualquer outro JSX, prop desconhecida, repetida ou
vazia (exceto `title`), prop obrigatória faltando, valor fora do permitido ou
expressão é erro. Comentários `{/* … */}` também são expressões e não são
aceitos.

Um componente de bloco pode ficar numa linha só (`<Callout>Texto.</Callout>`)
ou em várias. Com várias linhas, quebre a linha logo depois da tag de
abertura: texto na mesma linha da abertura que continua nas linhas seguintes
é erro de sintaxe do MDX. O conteúdo
é analisado estaticamente, e nenhum código do `.mdx` roda no build nem no site.
`import`/`export` em `.mdx` também são erro.

### `<Callout>`

```mdx
<Callout variant="warning">
  Evite usar **mais de uma** ação primária por tela.
</Callout>
```

| Prop | Valores | Padrão |
| --- | --- | --- |
| `variant` | `info`, `warning`, `tip` | `info` |

Conteúdo: parágrafos, headings, listas, código, `<Callout>`, `<DosDonts>` e
`<ComponentEmbed>`. Tabela dentro de callout é erro, como no CMS.

### `<ComponentEmbed>`

```mdx
<ComponentEmbed component="Button" variant="primary" />
```

| Prop | Obrigatória | O que é |
| --- | --- | --- |
| `component` | sim | Nome do componente no `PreviewConfig` (`component`). |
| `variant` | sim | Id da variante (`variants[].id`). |

Sem conteúdo (use a forma auto-fechada). As duas props são obrigatórias e não podem ser vazias, o que é mais estrito que o
CMS, onde o embed pode ficar sem variante. Com previews habilitados, o par
precisa existir nos `*.preview.tsx` do repo; se não existir, é erro.

### `<DosDonts>`

```mdx
<DosDonts variant="do" title="Use verbos no rótulo" coverComponent="Button" coverVariant="primary">
  "Salvar alterações" diz o que acontece; "OK" não.
</DosDonts>

<DosDonts variant="dont" title="Não empilhe ações primárias" coverImage="./dont-stack.png" coverAlt="Dois botões primários lado a lado">
  O usuário perde a referência de qual é a ação principal.
</DosDonts>
```

| Prop | Valores | Obrigatória |
| --- | --- | --- |
| `variant` | `do`, `dont` | sim |
| `title` | string | não |
| `coverImage` + `coverAlt` | caminho/URL da imagem e texto alternativo | não (`coverAlt` obrigatório com `coverImage`) |
| `coverComponent` + `coverVariant` | mesmo par do `<ComponentEmbed>` | não (os dois juntos) |

`coverImage` e `coverComponent` juntos é erro: o cover é uma imagem **ou** um
componente. Conteúdo: o mesmo do `<Callout>`, e tabela também é permitida.

### `<u>`

Sublinhado inline, sem props: `<u>texto</u>`.

## Aninhamento

Segue as mesmas regras do editor do CMS:

| Dentro de | Não pode |
| --- | --- |
| `<Callout>` (filho direto) | tabela — numa lista ou num `<DosDonts>` dentro do callout, pode |
| célula de tabela | tabela, `<Callout>` |

A sintaxe de tabela do GFM só comporta conteúdo inline na célula (texto com
marks e links). O CMS aceita mais coisas dentro de célula (listas, código,
componentes), mas o formato de arquivo fica, de propósito, com esse
subconjunto: não existe sintaxe Markdown legível para o resto.

## Configuração: `systembook.config.{ts,js,mjs,json}`

Na raiz do repositório (onde o CLI roda).

```ts
import type { SystemBookConfig } from '@systembook/cli';

export default {
  name: 'Acme Design System',
  logo: './brand/logo.svg',
  logoDark: './brand/logo-dark.svg',
  contentDir: 'docs',
  outDir: 'systembook-dist',
  base: '/acme-ds/',
  statusTags: [
    { titulo: 'Stable', cor: '#2e7d32' },
    { titulo: 'Beta', cor: '#ed6c02' },
  ],
} satisfies SystemBookConfig;
```

| Campo | Padrão | O que é |
| --- | --- | --- |
| `name` | **obrigatório** | Nome do design system (marca na sidebar sem logo, `<title>`). |
| `logo` / `logoDark` | — | Imagens da marca; `logoDark` cai no `logo` quando ausente. |
| `contentDir` | `docs` | Pasta do conteúdo. |
| `outDir` | `systembook-dist` | Pasta do site gerado. |
| `base` | `/` | Base de publicação (`/repo/` no GitHub Pages de projeto). |
| `statusTags` | `[]` | Tags que o frontmatter `status` pode usar (`titulo` + `cor`, como no CMS). |
| `previews` | `true` se houver `*.preview.tsx` | Builda os previews de componente junto. |

Campo desconhecido é erro.

## Erros

Todo erro de conteúdo traz o arquivo e a posição, e o comando lista **todos**
de uma vez:

```
docs/components/actions/button.mdx:14:1  <Badge> não é um componente aceito. Use <Callout>, <ComponentEmbed>, <DosDonts> ou <u>.
docs/foundation/color/palette.mdx:3:1    frontmatter: "titel" não é um campo conhecido (quis dizer "title"?).
docs/foundation/color/palette.mdx:22:3   heading de nível 4 não é suportado — use até ###.
```
