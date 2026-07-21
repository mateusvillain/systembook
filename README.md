# SystemBook

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**SystemBook** é uma plataforma **open source** e **self-hosted** para documentação
de design systems — no estilo Material Design Docs / Atlassian Design System, mas
com um **CMS real** por trás. Diferente das soluções Git-based, o conteúdo é escrito
e publicado direto por um painel administrativo (sem PR, sem deploy de engenharia),
e cada componente do design system pode ser embutido como um **preview real e
interativo** — um iframe do componente de verdade, buildado no CI do próprio time,
não uma captura de tela ou uma réplica manual. Roda como um **container Docker
único**, sem depender de nenhum serviço de terceiros pago. Uma instância documenta
um design system.

O problema que resolve: designers e editores de conteúdo conseguem manter a
documentação viva do design system sem depender de engenharia para cada alteração,
enquanto os componentes exibidos continuam sendo os componentes reais do código —
sempre atualizados via o pipeline de CI do time.

## O que **não** é

Para evitar expectativas erradas, estes itens estão **fora do escopo** (alguns são
backlog pós-MVP, outros são decisões de arquitetura deliberadas):

- **Não é Git-based.** O conteúdo vive num banco de dados (SQLite), editado pelo
  painel — não há commit/PR por edição, ao contrário de Docusaurus ou Decap CMS.
- **Não é multi-tenant.** Uma instância = um design system. Não há suporte a
  múltiplos design systems por instância no MVP.
- **Não é um builder de biblioteca de componentes.** O SystemBook **documenta e
  embute** os componentes que o seu time já constrói no repositório dele; ele não
  compila nem hospeda o código-fonte dos componentes.
- **Não tem fluxo de aprovação (draft → review → publish) no MVP.** O editor
  publica direto. Autosave grava rascunho; "Publicar" cria uma revisão versionada.
- **Não migra `.stories.tsx` automaticamente.** A leitura de stories do Storybook e
  a inferência de variantes via AST estão no backlog V2 — hoje as variantes de
  preview são declaradas em arquivos `*.preview.tsx`.

Outros itens de backlog V2: convite de usuário / recuperação de senha via SMTP,
diff granular entre revisões e multi-tenancy.

## Comparação

| | **SystemBook** | **Storybook** | **Zeroheight** | **Decap CMS** |
| --- | --- | --- | --- | --- |
| **Hospedagem** | Self-hosted (Docker) | Self-hosted (build estático) | SaaS pago | Self-hosted (front) |
| **Edição de conteúdo** | CMS real, direto no painel | MDX editado por dev | CMS SaaS | Git-based (commit/PR) |
| **Preview de componente real** | ✅ iframe do componente real, com variantes e controles | ✅ (foco central) | ⚠️ depende de sync com Storybook | ❌ docs estáticas |
| **Documentação de texto** | ✅ editor rich-text tipado | ⚠️ fraca/manual | ✅ | ✅ |
| **Custo** | Gratuito (só a hospedagem) | Gratuito (só a hospedagem) | Licença SaaS | Gratuito (só a hospedagem) |

Em resumo: o SystemBook combina o **CMS real** (edição direta, sem PR) do lado
"documentação" com o **live preview do componente real** do lado "Storybook" —
buildado no CI do próprio time, self-hosted e sem custo de licença.

## Quick start (self-hosting)

A imagem é publicada no GitHub Container Registry:
[`ghcr.io/mateusvillain/systembook`](https://github.com/mateusvillain/systembook/pkgs/container/systembook)
(multi-arch: `amd64` + `arm64`).

```bash
# 1. Pegue o compose de produção e o exemplo de variáveis de ambiente
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/docker-compose.production.yml
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/.env.production.example
cp .env.production.example .env

# 2. Edite o .env: gere segredos com `openssl rand -base64 32` e defina o
#    admin inicial (INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD)

# 3. Suba o container
docker compose -f docker-compose.production.yml up -d
```

No primeiro boot, o container roda as migrations e faz o seed do admin inicial a
partir das variáveis de ambiente. Acesse a instância na porta configurada e faça
login. O banco SQLite persiste no volume declarado no compose — o backup dele é
responsabilidade operacional de quem hospeda (sugestão: Litestream).

Para conectar o **pipeline de preview de componentes** (buildar os `*.preview.tsx`
do seu design system no CI e enviar o artefato para a instância), veja
[`docs/ci-example.md`](./docs/ci-example.md); o contrato dos arquivos
`*.preview.tsx` está em
[`docs/preview-tsx-schema.md`](./docs/preview-tsx-schema.md).

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
