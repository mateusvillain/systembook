# Publicar o modo estático

O `systembook build` gera em `systembook-dist/` (o `outDir` da config) um site
que é só arquivo: HTML, JS, CSS, JSON e imagens. Qualquer host estático serve,
sem servidor, banco ou regra de rewrite. Este guia cobre o GitHub Pages, a
Vercel e a Netlify. Em outro host, basta servir a pasta (ver
[Outros hosts](#outros-hosts)).

O [projeto de exemplo](../examples/static-docs) é publicado assim, de verdade,
no GitHub Pages deste repositório: <https://mateusvillain.github.io/systembook/>
(workflow em [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)).

## Antes: o CLI no projeto

Os hosts rodam o build no projeto, então o `@systembook/cli` precisa estar nas
`devDependencies`, junto do `react` e do `react-dom` (o
`npx @systembook/cli init` já os acrescenta; ou
`npm i -D @systembook/cli react react-dom`). Faça commit do lockfile.

## O que o host precisa fazer

O build já resolve quase tudo, e quase nada depende do host:

- **Uma URL por página.** Cada rota tem o próprio `index.html`
  (`foundation/color/palette/index.html`), com `<title>` e meta description. Um
  deep link e o refresh funcionam sem regra de rewrite.
- **`404.html`** na raiz da pasta, que os hosts deste guia servem sozinhos para
  caminhos inexistentes.
- **`base`**: se o site não fica na raiz do domínio (o site de projeto do GitHub
  Pages fica em `/<repo>/`), o build precisa saber o subpath. Defina `base` na
  config, ou passe `systembook build --base /<repo>/`, que vale só naquele build.
- **CORS nos previews.** Com `*.preview.tsx`, os previews de componente rodam
  num iframe isolado (`sandbox`, origem opaca), e o navegador só carrega os
  scripts dele se o host responder `Access-Control-Allow-Origin: *` em
  `_systembook/previews/`. O GitHub Pages já responde assim, o `_headers` gerado
  configura a Netlify e o Cloudflare Pages, e na Vercel o cabeçalho vai no
  `vercel.json` (abaixo). Sem previews, ignore este item.

## GitHub Pages

### 1. Ativar o Pages com GitHub Actions

No repositório: **Settings → Pages → Build and deployment → Source: GitHub
Actions**.

### 2. Criar o workflow

O jeito mais curto é pelo próprio CLI:

```bash
npx @systembook/cli init --github-pages
```

Ele escreve `.github/workflows/systembook-pages.yml` na raiz do repositório com
os comandos do seu gerenciador de pacotes (pelo lockfile), a branch atual e o
`outDir` da config. Faça commit do lockfile: sem ele, o workflow instala sem
travar versões e sem cache.

O workflow que ele gera para um projeto com npm (é a fonte canônica: um teste
do CLI garante que este bloco é igual à saída do `init`). Com pnpm ou yarn, o
`init` acrescenta os passos de cada um (`pnpm/action-setup`, `corepack enable`)
e troca o install, o `npx` e o `cache`; prefira gerar com ele a adaptar à mão:

```yaml
name: Docs

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Um deploy por vez; um push novo não cancela o que já está publicando.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - id: pages
        uses: actions/configure-pages@v5
      # Site de projeto fica em /<repo>/: o base_path vem do próprio Pages.
      - run: npx systembook build --base "${{ steps.pages.outputs.base_path }}/"
      - uses: actions/upload-pages-artifact@v3
        with:
          path: systembook-dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

| Linha | Por quê |
| --- | --- |
| `permissions` | `pages: write` e `id-token: write` são o que o `deploy-pages` exige. |
| `configure-pages` → `base_path` | O subpath do site: `/<repo>` num site de projeto, vazio num site de usuário/organização (`<user>.github.io`) ou com domínio próprio. Com a `/` do fim, vira a `base` certa nos três casos. |
| `upload-pages-artifact` → `path` | O `outDir` da config. |
| `concurrency` | Um deploy por vez, sem cancelar o que já está publicando. |

Projeto numa subpasta do repositório (um monorepo): o workflow continua na raiz
(`.github/` só é lido lá), com `working-directory: <pasta>` nos passos `run`, o
`path` do upload prefixado com a pasta e `cache-dependency-path` apontando para
o lockfile dela. O `init --root <pasta>` escreve assim.

### 3. Publicar

Faça push na branch do workflow. A URL aparece no job `deploy` e em
**Settings → Pages**.

Com a Source "GitHub Actions" o Jekyll não roda. Se você publicar pela outra
Source (*Deploy from a branch*, commitando a pasta gerada), o `.nojekyll` que o
build escreve impede o Jekyll de esconder as pastas `_systembook/`.

## Vercel

1. **Add New → Project**, importe o repositório.
2. Em **Build and Output Settings**:
   - **Framework Preset**: Other
   - **Build Command**: `npx systembook build` (ou o script, ex.: `npm run docs:build`)
   - **Output Directory**: `systembook-dist`
   - **Root Directory**: a pasta do projeto, se ele não estiver na raiz do repositório
3. Node.js 22 ou mais recente (a versão do Node fica nas configurações do projeto).

O site fica na raiz do domínio, então a `base` é a padrão (`/`). Com previews,
adicione o cabeçalho de CORS num `vercel.json` na raiz do projeto:

```json
{
  "headers": [
    {
      "source": "/_systembook/previews/(.*)",
      "headers": [{ "key": "Access-Control-Allow-Origin", "value": "*" }]
    }
  ]
}
```

Cada push publica: a branch de produção no domínio do projeto, as outras em
URLs de preview.

## Netlify

Um `netlify.toml` na raiz do projeto:

```toml
[build]
  command = "npx systembook build"
  publish = "systembook-dist"

[build.environment]
  NODE_VERSION = "22"
```

Depois, **Add new site → Import an existing project** e escolha o repositório;
as configurações vêm do arquivo. Com o projeto numa subpasta, defina **Base
directory** com ela.

O CORS dos previews já está resolvido: o build escreve um `_headers` que a
Netlify aplica. A `base` é a padrão (`/`).

## Outros hosts

Cloudflare Pages, S3 (com ou sem CloudFront), Firebase Hosting, Azure Static Web
Apps, um nginx: basta servir a pasta `systembook-dist/`. Confira três coisas:

1. **Subpath**: publicando fora da raiz do domínio, builde com a `base` dele
   (`--base /docs/`).
2. **404**: aponte a página de erro para o `404.html` (no S3: *Error document*).
3. **CORS dos previews**: `Access-Control-Allow-Origin: *` em
   `/_systembook/previews/*`. O Cloudflare Pages lê o `_headers` gerado; nos
   outros, configure no host.

Para conferir localmente antes de publicar, `npx serve systembook-dist` serve a
pasta com o cabeçalho de CORS (pelo `serve.json` gerado). Ele serve na raiz:
para testar um subpath, builde com a `base` padrão.
