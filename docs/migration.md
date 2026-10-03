# Migração entre modos (CMS ↔ estático)

Os dois modos do SystemBook usam o mesmo modelo de conteúdo
(`Menu → Seção → Página → Tab`, com os mesmos blocos) e geram a mesma doc
pública. Trocar de modo é, portanto, mover o conteúdo de um lugar para o outro.
Não há conversão de formato.

> **Status:** a migração automática — `systembook export` (instância CMS →
> arquivos `.mdx`) e `systembook import` (arquivos → instância CMS) — está
> planejada e ainda não existe. Hoje a migração é manual, com o mapeamento
> abaixo.

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

1. Rode `npx @systembook/cli init` no repositório do design system.
2. Copie nome, logos e status tags da instância para a config.
3. Recrie a árvore de pastas de `docs/` a partir da navegação da instância, e o
   conteúdo publicado de cada página como `.mdx` (as imagens vão junto, num
   caminho relativo ao arquivo).
4. Rode `systembook check`: ele aponta, com `arquivo:linha:coluna`, tudo o que
   não ficou no formato.
5. Publique ([`deploy-static.md`](./deploy-static.md)).

O que **não** acompanha: o histórico de revisões, os rascunhos não publicados e
os usuários. O histórico passa a ser o do git.

Algumas construções do editor do CMS não têm sintaxe de arquivo e precisam ser
simplificadas (o `check` acusa todas):

- conteúdo de bloco dentro de célula de tabela (heading, listas, código,
  do/don't, componentes) — no arquivo, a célula aceita só texto com marcas e
  links;
- `<ComponentEmbed>` sem variante escolhida — no arquivo, `variant` é
  obrigatória.

## Estático → CMS

1. Suba uma instância ([guia de setup](./setup.md)).
2. Configure nome, logos e status tags em Settings.
3. Crie menus, seções e páginas na ordem da árvore de `docs/`, recrie o conteúdo de
   cada arquivo no editor e publique.
4. Configure o CI de previews ([`ci-example.md`](./ci-example.md)): os mesmos
   `*.preview.tsx` passam a ser enviados para a instância.

Quase todo conteúdo do modo estático cabe no CMS, com uma exceção: **imagem
como bloco**. O CMS renderiza o bloco, mas o editor ainda não tem como inserir
uma imagem solta nem hospeda o arquivo. Na migração manual, troque a imagem por
um texto ou use-a como cover de um `<DosDonts>` com a URL de onde ela estiver
publicada.
