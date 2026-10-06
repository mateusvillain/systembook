# @systembook/cli

O CLI do [Systembook](https://github.com/mateusvillain/systembook): `systembook`.

```bash
npm i -D @systembook/cli @systembook/schema
npx systembook previews build
```

`@systembook/schema` entra explicitamente porque os seus `*.preview.tsx`
importam `PreviewConfig` dele — com pnpm, uma dependência transitiva não é
resolvível a partir do seu código.

## Comandos

| Comando | O que faz |
|---|---|
| `init` | Prepara o repo para o modo estático: config, `docs/`, scripts e `.gitignore` (ver abaixo) |
| `dev` | Servidor local do site, que recarrega ao salvar (ver abaixo) |
| `build` | Gera o site estático do modo estático em `outDir` (ver abaixo) |
| `check` | Valida conteúdo, config e referências sem gerar o site (para PR) |
| `export` | Converte uma instância do modo CMS num projeto do modo estático (ver abaixo) |
| `import` | Envia o projeto do modo estático para uma instância CMS, que cria e publica tudo (ver abaixo) |
| `previews discover` | Lista os `*.preview.tsx` encontrados e os que falharam na validação |
| `previews generate` | Escreve as entradas sintéticas em `.systembook/entries` |
| `previews build` | `generate` + build Vite, produzindo `.systembook/dist/` e `manifest.json` |

Todos, menos o `export`, aceitam `--root <dir>` (default: o diretório atual). O contrato dos
arquivos `*.preview.tsx` está em
[`docs/preview-tsx-schema.md`](https://github.com/mateusvillain/systembook/blob/main/docs/preview-tsx-schema.md),
e o workflow de CI em
[`docs/ci-example.md`](https://github.com/mateusvillain/systembook/blob/main/docs/ci-example.md).

## Começar: `systembook init`

```bash
npx @systembook/cli init
```

Num repo existente (ou numa pasta vazia), cria:

- `systembook.config.ts`, com o nome tirado do `package.json` (ou da pasta);
- `docs/index.mdx` (landing) e `docs/guide/basics/introduction.mdx` (uma página
  de exemplo). Se `docs/` já guarda outra documentação, o conteúdo vai para
  `systembook-docs/` (e a config aponta para lá); com uma config existente, vai
  para a `contentDir` dela, e só se ela ainda não tiver conteúdo;
- os scripts `docs:dev`, `docs:check` e `docs:build` e o `@systembook/cli` em
  `devDependencies` no `package.json` (que é criado, se não existir), com o
  `react` e o `react-dom` se faltarem — são peer dependencies do CLI, e o yarn 1
  não as instala sozinho;
- `systembook-dist/` e `.systembook/` no `.gitignore`;
- com `--github-pages` (ou respondendo "s" à pergunta), o workflow
  `.github/workflows/systembook-pages.yml` na raiz do repositório git, com os
  comandos do gerenciador do projeto (lockfile ou `packageManager`), a branch
  atual e o `outDir` da config. Faça commit do lockfile: sem ele, o workflow
  instala sem travar versões e sem cache.

Arquivo existente não é sobrescrito sem confirmação: num terminal, o comando
pergunta arquivo a arquivo; fora dele (CI, pipe), mantém o existente. `--force`
sobrescreve sem perguntar; Ctrl+C aborta. O `package.json` e o `.gitignore` nunca são
substituídos, só complementados: um script com o mesmo nome e outro comando fica
como está. O resultado passa no `check` e no `build` sem mais nada.

## Modo estático: `systembook build`

Lê o `systembook.config.{ts,js,mjs,json}` da raiz (ou de `--root <dir>`) e
gera em `outDir` (padrão `systembook-dist/`) um site que funciona em qualquer
host estático — GitHub Pages, Vercel, Netlify, S3 — na raiz ou em subpath
(`base`), com deep links e refresh sem regra de rewrite:

```
systembook-dist/
├── index.html                       # landing
├── foundation/color/palette/index.html
├── foundation/color/tokens/usage/index.html   # uma por página e por tab
├── 404.html
├── .nojekyll                        # o GitHub Pages ignora pastas com _ sem ele
├── _headers, serve.json             # CORS dos previews (Netlify/Cloudflare, npx serve)
└── _systembook/
    ├── assets/                      # bundle da doc
    ├── data/                        # nav, settings, previews e uma página por JSON
    ├── media/                       # imagens do conteúdo e logos, com hash no nome
    └── previews/                    # artefato do `previews build`, quando há *.preview.tsx
```

Cada `index.html` traz o `<title>` e a meta description da página (o
subtítulo, ou o primeiro parágrafo). Erros de conteúdo saem todos de uma vez,
com `arquivo:linha:coluna`, e o comando termina com código ≠ 0 sem gerar nada.
O formato do conteúdo e da config está em
[`docs/static-format.md`](https://github.com/mateusvillain/systembook/blob/main/docs/static-format.md).

Com `*.preview.tsx` no repo (e `previews` diferente de `false` na config), o
build roda o `previews build` junto, e todo `<ComponentEmbed>` e cover de
`<DosDonts>` precisa apontar para um par componente/variante que exista.
Imagens do conteúdo e os logos da config são copiados com hash no nome;
imagem ou logo que não existe é erro.

**Previews e CORS.** O iframe do preview é isolado (`sandbox`, origem opaca),
e o navegador só carrega os scripts dele se o host mandar
`Access-Control-Allow-Origin: *` em `_systembook/previews/` — o mesmo que o
server do modo CMS faz. O GitHub Pages já manda; no Netlify e no Cloudflare
Pages o `_headers` gerado cuida disso, e no `npx serve`, o `serve.json`. Na
Vercel, no S3 e em outros hosts, configure o cabeçalho para esse caminho.

O passo a passo de publicação (GitHub Pages, Vercel, Netlify e outros hosts)
está em
[`docs/deploy-static.md`](https://github.com/mateusvillain/systembook/blob/main/docs/deploy-static.md).

`--base <path>` sobrescreve a `base` da config só naquele build. É o que o
workflow do GitHub Pages usa: o subpath de um site de projeto (`/<repo>/`) vem
do próprio Pages (`steps.pages.outputs.base_path`), sem precisar estar na config.

O `outDir` é apagado a cada build; por isso ele precisa ser uma pasta própria
dentro do projeto — não a raiz, nem a pasta de conteúdo, `.git` ou
`node_modules`.

## Escrever localmente: `systembook dev`

Sobe o site em `http://localhost:4000/<base>` (`--port <n>` para outra porta;
ocupada, ele tenta a seguinte) e acompanha o projeto: salvar um `.mdx`, um
`_menu.yml`/`_section.yml`, uma imagem, a config ou um `*.preview.tsx` — ou um
arquivo que ele importa — recarrega o navegador, sem reiniciar o comando.

Erros de conteúdo aparecem no terminal e num overlay no navegador, com
`arquivo:linha:coluna`, como no `check`. O servidor continua de pé, com o que
deu para gerar (e os previews do último build que passou): corrija e salve, e o
overlay some. Uma config inválida também
vira erro no overlay (o servidor segue com a última config válida); só a
primeira carga, sem config válida, encerra o comando.

Nada é escrito no `outDir`: os dados são gerados em memória. Os previews são
buildados a cada mudança de código em `.systembook/dev/` (a mesma pasta
ignorável das entradas dos previews).

## Validar em PR: `systembook check`

Faz tudo o que o `build` valida — config, conteúdo, navegação, links entre
páginas, imagens, logos e os pares componente/variante dos previews — sem gerar
o site. Lista todos os erros de uma vez, com `arquivo:linha:coluna`, e termina
com código ≠ 0 se houver qualquer um:

```
docs/components/actions/button.mdx:6:1  heading de nível 4 não é suportado — use até ###.
docs/components/actions/button.mdx:12:1  variante "ghost" de "Button" não existe nos *.preview.tsx — variantes: primary, disabled.

2 erro(s).
```

Workflow de GitHub Actions que barra o PR com conteúdo quebrado
(`.github/workflows/systembook-check.yml`):

```yaml
name: Systembook check

# Sem filtro de `paths`: um check obrigatório filtrado fica pendente para
# sempre nos PRs que não tocam os caminhos — e mudar um componente também pode
# quebrar um preview que a doc usa.
on: pull_request

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Com npm ou yarn: remova este passo e o `cache: pnpm`, e troque o
      # install por `npm ci` / `yarn install --frozen-lockfile`.
      - uses: pnpm/action-setup@v4
        with:
          version: 10 # dispensável se o package.json tiver `packageManager`
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec systembook check
```

Os `*.preview.tsx` são compilados para ler o `PreviewConfig` de cada um (é o
que permite conferir os pares), então as dependências do repo precisam estar
instaladas. O bundle final dos previews (Vite) só roda no `build`: um erro que
apareça só ali — um import que o esbuild tolera e o Rollup não — passa pelo
`check`. E uma config inválida para o comando nela: sem a config, não se sabe
onde está o conteúdo.

## Vindo do modo CMS: `systembook export`

Converte uma instância do modo CMS num projeto do modo estático: `docs/` com um
`.mdx` por página e tab, `_menu.yml`/`_section.yml`, a `systembook.config.ts`
(nome, logos e status tags) e as imagens hospedadas na instância.

```bash
# Token de escopo "Migration", gerado por um admin em Settings → Tokens.
SYSTEMBOOK_TOKEN=… npx systembook export --from https://docs.acme.dev --out docs-estatico
npx systembook check --root docs-estatico
```

| Opção | O que faz |
|---|---|
| `--from <url>` | URL da instância (obrigatória) |
| `--token <token>` | Token de migração; sem ela, vale a variável `SYSTEMBOOK_TOKEN` (que não fica no histórico do shell) |
| `--out <dir>` | Pasta do projeto (default: `systembook-export`) |
| `-f, --force` | Escreve numa pasta que já tem arquivos, por cima dos de mesmo nome. Não apaga nada: um `.mdx` que sobrou de um export anterior continua lá |

Vai só o conteúdo **publicado**. As páginas nunca publicadas são listadas no
fim, e o que precisou ser simplificado para caber no formato de arquivo sai
como aviso, com o arquivo. O mapeamento completo está em
[`docs/migration.md`](https://github.com/mateusvillain/systembook/blob/main/docs/migration.md).

## Indo para o modo CMS: `systembook import`

Envia o projeto para uma instância CMS: ela cria os menus, as seções, as
páginas e as tabs, guarda as imagens do projeto e **publica** tudo, numa
transação — ou entra tudo, ou nada. As revisões ficam no nome do admin que
gerou o token.

```bash
# Token de escopo "Migration", gerado por um admin em Settings → Tokens.
SYSTEMBOOK_TOKEN=… npx systembook import --to https://docs.acme.dev
```

| Opção | O que faz |
|---|---|
| `--to <url>` | URL da instância (obrigatória) |
| `--token <token>` | Token de migração; sem ela, vale a variável `SYSTEMBOOK_TOKEN` |
| `--root <dir>` | Raiz do projeto, onde está a config (default: o diretório atual) |
| `--overwrite` | Substitui as páginas (e a landing) que já existem na instância, em vez de falhar |

O conteúdo passa pelas mesmas validações do `check` antes de sair da máquina.
Se uma página do projeto já existe na instância (mesmo menu, seção e slug), o
import falha listando todas, sem gravar nada; com `--overwrite`, elas são
substituídas. Nada é renomeado sozinho. Detalhes em
[`docs/migration.md`](https://github.com/mateusvillain/systembook/blob/main/docs/migration.md).

## Vindo do `@systembook/connector`

O bin `systembook-connector` continua funcionando, com um aviso de
depreciação. Os comandos são os mesmos, agora sob `previews`:
`systembook-connector build` → `systembook previews build`.

## Licença

MIT
