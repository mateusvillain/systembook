# Systembook

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[English](./README.md) · **Português (Brasil)**

O Systembook é uma plataforma open source para documentar design systems, no
estilo do Material Design Docs ou do Atlassian Design System. A ideia central: um
componente na documentação é o componente de verdade, não uma captura de tela.
Cada um é embutido como um preview interativo, um iframe do código real, buildado
no CI do próprio time.

Há duas formas de rodar, e as duas terminam na mesma documentação pública:

- **Modo CMS.** Um container Docker único, self-hosted, com painel administrativo.
  As pessoas escrevem e publicam no navegador, sem PR e sem deploy de engenharia.
  Tem revisões, usuários e papéis.
- **Modo estático.** O conteúdo fica em arquivos `.mdx` no repositório do design
  system. O CLI gera um site estático que qualquer host gratuito serve (GitHub
  Pages, Vercel, Netlify). Sem servidor, sem banco.

Nenhum dos dois depende de serviço pago de terceiros. Uma instância, ou um site,
documenta um design system.

**Exemplo ao vivo** (modo estático, publicado no GitHub Pages deste repositório):
<https://mateusvillain.github.io/systembook/>

## Escolha o modo

| | **Modo CMS** | **Modo estático** |
| --- | --- | --- |
| **Onde fica o conteúdo** | Banco SQLite da instância | Arquivos `.md`/`.mdx` no repositório |
| **Quem edita** | Qualquer pessoa com login, no editor visual | Quem tem acesso ao repositório, num editor de texto, por PR |
| **Distribuição** | Imagem Docker (`ghcr.io/mateusvillain/systembook`) | Pacote npm (`@systembook/cli`) |
| **Hospedagem** | Um servidor seu rodando o container | Qualquer host estático (GitHub Pages, Vercel, Netlify, S3…) |
| **Custo** | O servidor (VPS, container) | Gratuito nos hosts estáticos comuns |
| **Publicar** | Botão "Publish" no painel | Merge e build no CI |
| **Histórico** | Revisões por página, comparação por bloco, restauração | Histórico do git |
| **Só neste modo** | Editor visual, rascunho com autosave, usuários e papéis, dashboard de atividade | Review em PR, `systembook check` no CI, `systembook dev` com reload, sem servidor |

A documentação pública é a mesma nos dois: menus, seções, páginas com tabs,
previews interativos com controles, blocos de do/don't, callouts, código com
realce, busca e tema escuro.

Escolha o **CMS** se quem escreve a documentação não vive no repositório (design,
conteúdo) e precisa publicar sozinho. Escolha o **estático** se a documentação
deve andar junto do código, ser revisada no mesmo PR, e você prefere não manter um
servidor. Dá para trocar depois: veja [migração entre modos](./docs/migration.md).

## O que não é

Alguns itens estão fora do escopo, uns como backlog e outros de propósito:

- **No modo CMS, não é Git-based.** O conteúdo fica num banco de dados e é editado
  pelo painel, então não há commit nem PR por edição. Se é isso que você quer, use
  o modo estático.
- **Não é multi-tenant.** Uma instância é um design system.
- **Não constrói a sua biblioteca de componentes.** O Systembook documenta e embute
  os componentes que o seu time já constrói. Ele não compila nem hospeda o código
  deles.
- **O modo CMS ainda não tem fluxo de aprovação.** Quem edita publica direto. O
  autosave guarda um rascunho, e "Publish" cria uma revisão versionada.
- **Não importa arquivos `.stories.tsx`.** Ler stories do Storybook e inferir
  variantes pela AST está no backlog. Por enquanto, as variantes de preview são
  declaradas em arquivos `*.preview.tsx`.

Também no backlog: convite de usuário e recuperação de senha por email, diff mais
granular entre revisões e multi-tenancy.

## Comparação

| | **Systembook** | **Storybook** | **Zeroheight** | **Supernova** |
| --- | --- | --- | --- | --- |
| **O que é** | Plataforma de docs com previews de componentes reais | Oficina de componentes com docs | Docs de design system hospedada | Plataforma de design system hospedada (docs, tokens, automação de código) |
| **Hospedagem** | Self-hosted (Docker) ou qualquer host estático | Build estático self-hosted | SaaS hospedado | SaaS hospedado |
| **Quem escreve a doc** | Qualquer pessoa num editor visual (CMS), ou devs em `.mdx` (estático) | Devs, em MDX | Designers e redatores, num editor hospedado | Designers e redatores, num editor hospedado |
| **Preview de componente real** | Sim: o componente real num iframe, com variantes e controles, buildado no seu CI | Sim, é o centro da ferramenta | Embute o seu Storybook | Conecta dados do Storybook |
| **Sync com Figma** | Não | Por addons | Sim | Sim |
| **Design tokens** | Não | Não | Sim | Sim |
| **Custo** | Gratuito, você paga a hospedagem | Gratuito, você paga a hospedagem | Plano gratuito limitado, planos pagos | Plano gratuito limitado, planos pagos |
| **Open source** | MIT | MIT | Não | Não |

O Storybook é o melhor lugar para desenvolver e testar componentes, e a doc dele é
escrita por devs. Zeroheight e Supernova servem times que vivem no Figma e querem
tokens e sync. O Systembook é para quando você quer documentação editorial e os
componentes reais num só lugar que você hospeda e controla, sem licença por
usuário.

## Instalação

- [Modo CMS (Docker)](#modo-cms-docker)
- [Modo estático (npm)](#modo-estático-npm)

## Modo CMS (Docker)

O modo CMS roda como um único container Docker. Não há banco externo, fila ou
serviço de terceiros para configurar. O passo a passo completo (subir a instância,
primeiro login, instalar o CLI no repositório do design system, configurar o CI)
está no [**guia de setup**](./docs/setup.md). Segue uma versão curta.

### Requisitos

- **Docker** e **Docker Compose** na máquina que vai hospedar a instância.
- Um repositório de componentes com **CI**, se quiser previews reais (opcional para
  começar).
- Você não precisa clonar este repositório para hospedar o Systembook. Basta baixar
  o compose de produção e o template de variáveis.

### 1. Baixe o compose e o `.env`

A imagem é publicada no GitHub Container Registry:
[`ghcr.io/mateusvillain/systembook`](https://github.com/mateusvillain/systembook/pkgs/container/systembook)
(multi-arch: `amd64` e `arm64`).

```bash
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/docker-compose.production.yml
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/.env.production.example
cp .env.production.example .env
```

### 2. Preencha as variáveis obrigatórias

| Variável | O que é | Como preencher |
| --- | --- | --- |
| `SESSION_SECRET` | Segredo que assina os cookies de sessão. | `openssl rand -base64 32` |
| `ARGON2_SECRET` | Pepper do hash de senha (argon2id). **Não mude depois de criar usuários**, ou todas as senhas deixam de funcionar. | `openssl rand -base64 32` |
| `INITIAL_ADMIN_EMAIL` | Email do admin criado no primeiro boot. | ex.: `admin@suaempresa.com` |
| `INITIAL_ADMIN_PASSWORD` | Senha desse admin. | Uma senha forte (mín. 8 caracteres) |

As opcionais (`PORT`, `DATABASE_PATH`, `PREVIEWS_PATH`) já têm valor padrão na imagem.

### 3. Suba o container

```bash
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps    # deve ficar "healthy"
```

No primeiro boot (banco vazio), o container roda as migrations e cria o admin
inicial a partir das variáveis de ambiente. Abra a instância na porta configurada
(`3000` por padrão), entre em `/login`, depois crie usuários nomeados e troque a
credencial de bootstrap. Em produção, coloque um reverse proxy com TLS na frente:
os cookies de sessão são `Secure` fora de ambiente local.

O banco SQLite e os artefatos de preview ficam no volume `systembook-data`
declarado no compose, então sobrevivem a recriações e atualizações do container. O
backup é responsabilidade de quem hospeda. Veja o
[guia de backup e recuperação](./docs/backup.md) (o setup recomendado usa
Litestream).

### 4. Atualize a instância

```bash
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

As migrations pendentes rodam sozinhas quando a nova versão sobe. Faça backup do
volume antes de atualizar.

### 5. (Opcional) Conecte o pipeline de previews

Para embutir os componentes reais do seu design system, instale o CLI no
repositório de componentes e publique os artefatos pelo CI:

```bash
pnpm add -D @systembook/cli @systembook/schema   # ou npm i -D / yarn add -D
npx systembook previews build --root .
```

O workflow completo do GitHub Actions está em [`docs/ci-example.md`](./docs/ci-example.md),
e o contrato dos arquivos `*.preview.tsx` está em
[`docs/preview-tsx-schema.md`](./docs/preview-tsx-schema.md).

## Modo estático (npm)

Precisa de Node.js 22+ e `@systembook/cli` 0.3.0 ou mais recente. No repositório do
design system (ou numa pasta vazia):

```bash
npx @systembook/cli init     # config, docs/ com landing e uma página, scripts e .gitignore
npm install                  # ou pnpm install / yarn
npm run docs:dev             # http://localhost:4000, recarrega ao salvar
```

O `init` pergunta se deve criar o workflow de deploy no GitHub Pages (passe
`--github-pages` ou `--no-github-pages` para não perguntar). Se `docs/` já guarda
outra documentação, o conteúdo vai para `systembook-docs/`. A partir daí:

| Comando | O que faz |
| --- | --- |
| `systembook dev` | Servidor local; erros de conteúdo aparecem num overlay |
| `systembook check` | Valida conteúdo, links, imagens e previews (rode em PRs) |
| `systembook build` | Gera o site em `systembook-dist/` |

- [**Formato do conteúdo**](./docs/static-format.md): pastas, frontmatter, blocos e
  componentes MDX (`<Callout>`, `<ComponentEmbed>`, `<DosDonts>`).
- [**Publicação**](./docs/deploy-static.md): GitHub Pages, Vercel, Netlify e outros
  hosts.
- [**Projeto de exemplo**](./examples/static-docs): um design system completo nesse
  formato, com previews. É o que está publicado em
  <https://mateusvillain.github.io/systembook/>.
- [**Migração entre modos**](./docs/migration.md).
- Os previews de componente usam os mesmos arquivos `*.preview.tsx` do modo CMS
  ([contrato](./docs/preview-tsx-schema.md)), e o `build` os inclui no site.

## Desenvolvimento

O setup local (dois processos em dev, checks de CI, convenções) está no
[`CONTRIBUTING.md`](./CONTRIBUTING.md). Notas de arquitetura e armadilhas do
repositório estão no [`CLAUDE.md`](./CLAUDE.md).

```bash
git clone https://github.com/mateusvillain/systembook.git
cd systembook
pnpm install
pnpm dev                               # server (porta 3000)
pnpm --filter @systembook/admin dev    # painel admin (porta 5173)
```

## Licença

[MIT](./LICENSE). Contribuições são bem-vindas, veja o
[`CONTRIBUTING.md`](./CONTRIBUTING.md).
