# SystemBook

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**SystemBook** é uma plataforma **open source** para documentação de design
systems — no estilo Material Design Docs / Atlassian Design System — em que cada
componente pode ser embutido como um **preview real e interativo**: um iframe do
componente de verdade, buildado no CI do próprio time, não uma captura de tela ou
uma réplica manual.

Funciona de dois jeitos, com a mesma documentação pública no fim:

- **Modo CMS** — um **container Docker único**, self-hosted, com um painel
  administrativo: o conteúdo é escrito e publicado direto no navegador (sem PR,
  sem deploy de engenharia), com revisões, usuários e papéis.
- **Modo estático** — o conteúdo vive em arquivos **`.mdx` dentro do repositório**
  do design system, e o CLI gera um **site estático** que qualquer host gratuito
  serve (GitHub Pages, Vercel, Netlify). Sem servidor e sem banco.

Nenhum dos dois depende de serviço de terceiros pago. Uma instância (ou um site)
documenta um design system.

O problema que resolve: manter a documentação viva do design system — pelo painel,
sem depender de engenharia, ou junto do código, revisada em PR — enquanto os
componentes exibidos continuam sendo os componentes reais do código, sempre
atualizados via o pipeline de CI do time.

**Exemplo ao vivo** (modo estático, publicado pelo GitHub Pages deste
repositório): <https://mateusvillain.github.io/systembook/>

## Escolha seu modo

| | **Modo CMS** | **Modo estático** |
| --- | --- | --- |
| **Fonte do conteúdo** | Banco SQLite da instância | Arquivos `.md`/`.mdx` no repositório |
| **Quem edita** | Qualquer pessoa com login, no editor visual do painel | Quem tem acesso ao repositório, num editor de texto, via PR |
| **Distribuição** | Imagem Docker (`ghcr.io/mateusvillain/systembook`) | Pacote npm (`@systembook/cli`) |
| **Hospedagem** | Um servidor seu rodando o container | Qualquer host estático (GitHub Pages, Vercel, Netlify, S3…) |
| **Custo** | O servidor (VPS, container) | Gratuito nos hosts estáticos comuns |
| **Publicar** | Botão "Publicar" no painel | Merge na branch + build no CI |
| **Histórico** | Revisões por página, comparação e restauração | O histórico do git |
| **Recursos só deste modo** | Editor visual, rascunho com autosave, revisões e diff, usuários e papéis, dashboard de atividade | Review em PR, `systembook check` no CI, `systembook dev` com reload, site sem servidor |
| **Nos dois** | A mesma doc pública: menus, seções, páginas com tabs, previews interativos com controles, do/don't, callouts, código com realce, busca, tema escuro | ← |

Use o **CMS** quando quem escreve a doc não vive no repositório (design,
conteúdo) e precisa publicar sozinho. Use o **estático** quando a doc deve andar
junto do código, revisada no mesmo PR, e você não quer manter um servidor.
Trocar de modo depois é possível — veja [migração entre modos](./docs/migration.md).

## O que **não** é

Para evitar expectativas erradas, estes itens estão **fora do escopo** (alguns são
backlog pós-MVP, outros são decisões de arquitetura deliberadas):

- **No modo CMS, não é Git-based.** O conteúdo vive num banco de dados (SQLite),
  editado pelo painel — não há commit/PR por edição. (Se é isso que você quer,
  use o modo estático.)
- **Não é multi-tenant.** Uma instância = um design system. Não há suporte a
  múltiplos design systems por instância no MVP.
- **Não é um builder de biblioteca de componentes.** O SystemBook **documenta e
  embute** os componentes que o seu time já constrói no repositório dele; ele não
  compila nem hospeda o código-fonte dos componentes.
- **O modo CMS não tem fluxo de aprovação (draft → review → publish) no MVP.** O
  editor publica direto. Autosave grava rascunho; "Publicar" cria uma revisão versionada.
- **Não migra `.stories.tsx` automaticamente.** A leitura de stories do Storybook e
  a inferência de variantes via AST estão no backlog V2 — hoje as variantes de
  preview são declaradas em arquivos `*.preview.tsx`.

Outros itens de backlog V2: convite de usuário / recuperação de senha via SMTP,
diff granular entre revisões e multi-tenancy.

## Comparação

| | **SystemBook** | **Storybook** | **Zeroheight** | **Decap CMS** |
| --- | --- | --- | --- | --- |
| **Hospedagem** | Self-hosted (Docker) ou qualquer host estático | Self-hosted (build estático) | SaaS pago | Self-hosted (front) |
| **Edição de conteúdo** | CMS real no painel, ou `.mdx` no repo | MDX editado por dev | CMS SaaS | Git-based (commit/PR) |
| **Preview de componente real** | ✅ iframe do componente real, com variantes e controles | ✅ (foco central) | ⚠️ depende de sync com Storybook | ❌ docs estáticas |
| **Documentação de texto** | ✅ editor rich-text tipado | ⚠️ fraca/manual | ✅ | ✅ |
| **Custo** | Gratuito (só a hospedagem) | Gratuito (só a hospedagem) | Licença SaaS | Gratuito (só a hospedagem) |

Em resumo: o SystemBook combina a **documentação de texto** — num CMS real, ou em
arquivos no repo — com o **live preview do componente real** do lado "Storybook",
buildado no CI do próprio time, self-hosted e sem custo de licença.

## Instalação

- [Modo CMS (Docker)](#modo-cms-docker)
- [Modo estático (npm)](#modo-estático-npm)

## Modo CMS (Docker)

O modo CMS roda como um **container Docker único** — não há banco externo, fila
ou serviço de terceiros para provisionar. O passo a passo completo (subir a
instância, primeiro login, instalar o conector no repo do design system e
configurar o CI) está no [**guia de setup**](./docs/setup.md); o resumo está abaixo.

### Pré-requisitos

- **Docker** + **Docker Compose** na máquina/servidor que vai hospedar a instância.
- Um repositório de componentes com **CI**, se você quiser publicar previews reais
  (opcional para começar).
- Você **não precisa clonar este repositório** para hospedar o SystemBook — só
  baixar o compose de produção e o template de variáveis.

### 1. Baixar o compose e o `.env`

A imagem é publicada no GitHub Container Registry:
[`ghcr.io/mateusvillain/systembook`](https://github.com/mateusvillain/systembook/pkgs/container/systembook)
(multi-arch: `amd64` + `arm64`).

```bash
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/docker-compose.production.yml
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/.env.production.example
cp .env.production.example .env
```

### 2. Preencher as variáveis obrigatórias

| Variável | O que é | Como preencher |
| --- | --- | --- |
| `SESSION_SECRET` | Segredo que assina os cookies de sessão. | `openssl rand -base64 32` |
| `ARGON2_SECRET` | Pepper do hash de senha (argon2id). **Não mude depois de criar usuários** — invalidaria todas as senhas. | `openssl rand -base64 32` |
| `INITIAL_ADMIN_EMAIL` | Email do admin criado no primeiro boot. | ex.: `admin@suaempresa.com` |
| `INITIAL_ADMIN_PASSWORD` | Senha desse admin. | senha forte (mín. 8 caracteres) |

As opcionais (`PORT`, `DATABASE_PATH`, `PREVIEWS_PATH`) já têm default na imagem.

### 3. Subir o container

```bash
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps    # deve ficar "healthy"
```

No primeiro boot (banco vazio), o container roda as migrations e faz o seed do
admin inicial a partir das variáveis de ambiente. Acesse a instância na porta
configurada (default `3000`), faça login em `/login` e — logo em seguida — crie
usuários nomeados e rotacione a credencial de bootstrap. Em produção, coloque um
reverse proxy com TLS na frente: os cookies de sessão são `Secure` fora de
ambiente local.

O banco SQLite e os artefatos de preview persistem no volume `systembook-data`
declarado no compose, então sobrevivem a recriações e updates do container. O
backup é responsabilidade operacional de quem hospeda — veja o
[guia de backup e recuperação](./docs/backup.md) (setup recomendado com Litestream).

### 4. Atualizar a instância

```bash
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

As migrations pendentes rodam automaticamente no boot da nova versão. Faça backup
do volume antes de atualizar.

### 5. (Opcional) Conectar o pipeline de previews

Para embutir os componentes reais do seu design system, instale o CLI no
repositório de componentes e publique os artefatos pelo CI:

```bash
pnpm add -D @systembook/cli @systembook/schema   # ou npm i -D / yarn add -D
npx systembook previews build --root .
```

O workflow completo de GitHub Actions está em
[`docs/ci-example.md`](./docs/ci-example.md); o contrato dos arquivos
`*.preview.tsx` está em
[`docs/preview-tsx-schema.md`](./docs/preview-tsx-schema.md).

## Modo estático (npm)

Requer Node.js 22+ e o `@systembook/cli` 0.3.0 ou mais recente. No repositório
do design system (ou numa pasta vazia):

```bash
npx @systembook/cli init     # config, docs/ com landing e uma página, scripts e .gitignore
npm install                  # ou pnpm install / yarn
npm run docs:dev             # http://localhost:4000, recarrega ao salvar
```

O `init` pergunta se deve criar o workflow de deploy no GitHub Pages
(`--github-pages` para não perguntar). A partir daí:

| Comando | O que faz |
| --- | --- |
| `systembook dev` | Servidor local; erros de conteúdo aparecem num overlay |
| `systembook check` | Valida conteúdo, links, imagens e previews (para rodar em PR) |
| `systembook build` | Gera o site em `systembook-dist/` |

- [**Formato do conteúdo**](./docs/static-format.md): pastas, frontmatter,
  blocos e componentes MDX (`<Callout>`, `<ComponentEmbed>`, `<DosDonts>`).
- [**Publicar**](./docs/deploy-static.md): GitHub Pages, Vercel, Netlify e
  outros hosts.
- [**Projeto de exemplo**](./examples/static-docs): um design system completo no
  formato, com previews — é o que está publicado em
  <https://mateusvillain.github.io/systembook/>.
- [**Migração entre modos**](./docs/migration.md).
- Previews de componente: os mesmos `*.preview.tsx` do modo CMS
  ([contrato](./docs/preview-tsx-schema.md)); o `build` os inclui no site.

## Desenvolvimento

Instruções de setup local (dois processos em dev, checks de CI, convenções) estão
no [`CONTRIBUTING.md`](./CONTRIBUTING.md). Detalhes de arquitetura e gotchas do
repositório estão no [`CLAUDE.md`](./CLAUDE.md).

```bash
git clone https://github.com/mateusvillain/systembook.git
cd systembook
pnpm install
pnpm dev                               # server (porta 3000)
pnpm --filter @systembook/admin dev    # painel admin (porta 5173)
```

## Licença

[MIT](./LICENSE). Contribuições são bem-vindas — veja o
[`CONTRIBUTING.md`](./CONTRIBUTING.md).
