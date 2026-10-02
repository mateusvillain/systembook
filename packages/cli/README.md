# @systembook/cli

O CLI do [SystemBook](https://github.com/mateusvillain/systembook): `systembook`.

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
| `build` | Gera o site estático do modo estático em `outDir` (ver abaixo) |
| `check` | Valida conteúdo, config e referências sem gerar o site (para PR) |
| `previews discover` | Lista os `*.preview.tsx` encontrados e os que falharam na validação |
| `previews generate` | Escreve as entradas sintéticas em `.systembook/entries` |
| `previews build` | `generate` + build Vite, produzindo `.systembook/dist/` e `manifest.json` |

Todos aceitam `--root <dir>` (default: o diretório atual). O contrato dos
arquivos `*.preview.tsx` está em
[`docs/preview-tsx-schema.md`](https://github.com/mateusvillain/systembook/blob/main/docs/preview-tsx-schema.md),
e o workflow de CI em
[`docs/ci-example.md`](https://github.com/mateusvillain/systembook/blob/main/docs/ci-example.md).

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

O `outDir` é apagado a cada build; por isso ele precisa ser uma pasta própria
dentro do projeto — não a raiz, nem a pasta de conteúdo, `.git` ou
`node_modules`.

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
name: SystemBook check

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

## Vindo do `@systembook/connector`

O bin `systembook-connector` continua funcionando, com um aviso de
depreciação. Os comandos são os mesmos, agora sob `previews`:
`systembook-connector build` → `systembook previews build`.

## Licença

MIT
