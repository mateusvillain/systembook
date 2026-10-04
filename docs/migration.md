# Migração entre modos (CMS ↔ estático)

Os dois modos do SystemBook usam o mesmo modelo de conteúdo
(`Menu → Seção → Página → Tab`, com os mesmos blocos) e geram a mesma doc
pública. Trocar de modo é, portanto, mover o conteúdo de um lugar para o outro.
Não há conversão de formato.

> **Status:** as duas direções são automáticas: CMS → estático com
> `systembook export`, estático → CMS com `systembook import`.

## Como cada coisa corresponde

| No CMS | No modo estático |
| --- | --- |
| Nome do design system, logo e logo do tema escuro (Settings) | `name`, `logo`, `logoDark` no `systembook.config.ts` |
| Status tags (Settings) | `statusTags` na config (`titulo` + `cor`) |
| Página inicial (landing) | `docs/index.mdx` |
| Menu (topo do site) | pasta de 1º nível em `docs/` + `_menu.yml` (`title`, `order`) |
| Seção (barra lateral) | pasta dentro do menu + `_section.yml` |
| Página sem tabs | arquivo `<slug>.mdx` dentro da seção |
| Página com tabs | pasta `<slug>/`: `index.mdx` é o Overview, cada tab é um arquivo |
| Título, subtítulo, status, ordem | frontmatter: `title`, `subtitle`, `status`, `order` |
| Slug | nome do arquivo ou da pasta (ou `slug` no frontmatter) |
| Blocos de texto, listas, código, tabela | Markdown |
| Cover de imagem do do/don't (URL) | `coverImage` + `coverAlt` no `<DosDonts>` |
| — (o editor do CMS não insere imagem solta) | Imagem como bloco: `![alt](./arquivo.png "legenda")` |
| Callout, componente, do/don't | `<Callout>`, `<ComponentEmbed>`, `<DosDonts>` |
| Previews (`*.preview.tsx` enviados pelo CI) | os mesmos `*.preview.tsx`, buildados pelo `systembook build` |

O formato completo (frontmatter, blocos e componentes, com exemplos) está em
[`static-format.md`](./static-format.md).

## CMS → estático

1. Como admin, gere um token de escopo **Migration** em Settings → Tokens. Ele
   lê o conteúdo inteiro da instância: não o coloque no CI, e revogue-o depois
   da migração.
2. Rode o export no repositório do design system:

   ```bash
   SYSTEMBOOK_TOKEN=… npx @systembook/cli export --from https://docs.acme.dev --out .
   ```

   Sem `--out`, o projeto vai para `systembook-export/`. Numa pasta que já tem
   arquivos (como a raiz do repo), o comando só escreve com `--force`, e aí
   sobrescreve os arquivos de mesmo nome (`systembook.config.ts`, `docs/…`).
   O resto fica como estava.
3. Rode `systembook check`. Se o export não deu aviso, ele passa.
4. Para o projeto ficar completo, rode `npx @systembook/cli init` (scripts,
   `.gitignore` e, se quiser, o workflow do GitHub Pages). O `init` mantém a
   config e o conteúdo exportados.
5. Publique ([`deploy-static.md`](./deploy-static.md)).

O que o export gera:

- `docs/index.mdx`, com a landing publicada;
- uma pasta por menu e por seção, com `_menu.yml`/`_section.yml` (título e
  ordem). Menus e seções sem página publicada ficam de fora, como na doc;
- um `.mdx` por página, ou uma pasta `<página>/` com `index.mdx` e um arquivo
  por tab. O frontmatter traz título, subtítulo, ordem e status. Tabs com o
  mesmo título ganham slugs distintos (`codigo`, `codigo-2`);
- `systembook.config.ts` com o nome, os logos (em `brand/`) e as status tags;
- os links entre páginas (`/docs/menu/seção/página`) reescritos para o caminho
  relativo do `.mdx` de destino;
- as imagens hospedadas na própria instância, baixadas para `docs/_images/`.
  Imagens de outros endereços continuam apontando para a URL original.

O que **não** acompanha: rascunhos e páginas nunca publicadas (o comando as
lista no fim), o histórico de revisões e os usuários. O histórico passa a ser
o do git.

Algumas construções do editor do CMS não têm sintaxe de arquivo. O export as
simplifica para o equivalente mais próximo e avisa cada uma, com o arquivo:

- conteúdo de bloco dentro de célula de tabela (heading, listas, código,
  do/don't, componentes) vira texto corrido: no arquivo, a célula aceita só
  texto com marcas e links;
- tabela sem linha de cabeçalho, células mescladas e larguras de coluna;
- `<ComponentEmbed>` sem variante escolhida é removido, porque no arquivo
  `variant` é obrigatória;
- heading de nível 4 vira nível 3;
- formatação colada em pontuação de um jeito que o Markdown não representa.

## Estático → CMS

1. Suba uma instância ([guia de setup](./setup.md)) e, como admin, gere um
   token de escopo **Migration** em Settings → Tokens. Ele escreve o conteúdo
   inteiro da instância: não o coloque no CI, e revogue-o depois da migração.
2. Rode o import na raiz do projeto:

   ```bash
   SYSTEMBOOK_TOKEN=… npx @systembook/cli import --to https://docs.acme.dev
   ```

   O conteúdo passa pelas validações do `systembook check` antes de ser
   enviado; com erro, nada sai da máquina.
3. Configure o CI de previews ([`ci-example.md`](./ci-example.md)): os mesmos
   `*.preview.tsx` passam a ser enviados para a instância. O import não leva
   os previews — até o primeiro envio do CI, os embeds mostram "no preview
   published".

O que o import faz, numa transação só (ou entra tudo, ou nada):

- cria os menus, as seções, as páginas e as tabs do projeto, na ordem dele, e
  **publica** cada página e a landing. As revisões ficam no nome do admin que
  gerou o token, com a mensagem "Imported from static mode";
- guarda as imagens do projeto na instância (servidas em `/api/media/…`) e
  aponta os blocos para elas. Imagens por URL continuam na URL;
- mantém os links entre páginas e tabs funcionando com os endereços da
  instância;
- cria as status tags da config que a instância ainda não tem (pelo nome);
- aplica o nome e os logos da config **se a instância não tem nenhuma
  página** (ou com `--overwrite`). Logo por URL não é importado: envie-o em
  Settings. No CMS o logo precisa ser PNG, JPEG ou SVG.

### Slugs que já existem

Menus e seções com o mesmo slug de um que já existe na instância são
reaproveitados: o conteúdo entra neles. Para páginas, a regra é:

- **por padrão, o import falha** se alguma página do projeto já existe (mesmo
  menu, seção e slug) ou se a landing da instância já foi publicada. A
  mensagem lista todos os conflitos de uma vez e nada é gravado;
- com **`--overwrite`**, essas páginas são substituídas: mantêm o endereço e o
  histórico, ganham o título, o conteúdo e as tabs do projeto (as tabs que só
  existiam na instância somem) e uma revisão nova;
- nada é renomeado automaticamente.

Um caso não tem `--overwrite` que resolva: no CMS o slug de **seção** é único
na instância inteira, enquanto no modo estático ele só precisa ser único
dentro do menu. Se duas seções do projeto (em menus diferentes) têm o mesmo
slug, ou se uma seção do projeto tem o slug de uma seção que mora em outro
menu da instância, o import falha pedindo para renomear uma delas.
