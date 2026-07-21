# Contribuindo com o SystemBook

Obrigado pelo interesse em contribuir! Este guia cobre como rodar o projeto
localmente, os checks esperados antes de um PR, e as convenções do repositório.

O SystemBook é um CMS self-hosted para documentação de design systems: monorepo
pnpm com um servidor Node/tRPC + SQLite (`apps/server`), um painel admin React
(`apps/admin`) e pacotes compartilhados (`packages/*`). Uma instância = um design
system, distribuída como um único container Docker.

## Pré-requisitos

- **Node.js** ≥ 22 (o CI e a imagem usam Node 24)
- **pnpm** 10 — o repositório fixa a versão via campo `packageManager`; se você
  tiver o Corepack habilitado (`corepack enable`), a versão certa é usada
  automaticamente.
- **Docker** (opcional) — só para rodar via compose ou testar a imagem.

## Setup local

```bash
git clone https://github.com/mateusvillain/systembook.git
cd systembook
pnpm install
```

Crie o arquivo de ambiente na raiz (não commitado). Use o exemplo de produção
como referência dos nomes das variáveis:

```bash
cp .env.production.example .env.local
# edite .env.local: PORT, DATABASE_PATH (ex.: apps/server/data/systembook.db),
# SESSION_SECRET, ARGON2_SECRET, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD
```

Gere os segredos com valores aleatórios, ex.: `openssl rand -base64 32`.

### Rodando em dev (dois processos)

```bash
# Terminal 1 — API/banco (porta 3000), tsx em watch
pnpm dev

# Terminal 2 — painel admin com Vite/hot-reload (porta 5173)
pnpm --filter @systembook/admin dev
```

Acesse **http://localhost:5173** — o Vite faz proxy de `/trpc` para a porta 3000,
mantendo tudo same-origin (os cookies de sessão funcionam sem CORS). Sem o Vite,
`http://localhost:3000` serve o último build estático do admin (modo produção do
container único).

### Alternativa: dev via Docker Compose

```bash
docker compose up
```

O `docker-compose.yml` (compose de **desenvolvimento**) roda o server em watch
com bind-mount do repositório. **Não confunda** com o
`docker-compose.production.yml`, que roda a imagem publicada — esse é para
self-hosting, não para desenvolvimento.

## Antes de abrir um PR

Rode os três checks (é exatamente o que o CI roda, em ordem):

```bash
pnpm lint        # eslint em todos os pacotes
pnpm typecheck   # tsc --noEmit em todos os pacotes
pnpm test        # vitest (server, preview-kit, connector)
```

Atalhos úteis:

```bash
pnpm --filter @systembook/server test                                   # só o server
pnpm --filter @systembook/server exec vitest run src/trpc/auth.test.ts  # um arquivo
```

Todos os três precisam passar. O CI (GitHub Actions) roda `lint → typecheck →
test` e precisa estar verde para o merge.

## Convenções

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/),
  com mensagens em **português** (ex.: `feat(public): busca full-text`,
  `fix(sections): ...`).
- **Branches/PRs**: trabalhe numa branch de feature e abra PR para a `main`. A
  `main` é protegida pelo CI; descreva o que mudou e como verificou.
- **Nomes de domínio em português** (`titulo`, `ordem`, `senha_hash`,
  `criadoEm`); IDs são UUID.
- **Migrations** (`apps/server/drizzle/`) são geradas por `pnpm --filter
  @systembook/server db:generate` a partir do `schema.ts` — **nunca edite uma
  migration à mão** (a única exceção documentada são virtual tables que o Drizzle
  não expressa, como a FTS5, escritas como SQL cru + entrada no `_journal.json`).
- **Estilo**: ESLint 9 flat config único na raiz; `no-unused-vars` ignora o
  prefixo `_`. NodeNext no server/packages (imports relativos com extensão
  `.js`); `bundler` no admin.

Detalhes adicionais de arquitetura e gotchas do repositório estão no
[`CLAUDE.md`](./CLAUDE.md).

## ⚠️ Mudanças em `packages/schema` são um contrato cross-cutting

`packages/schema` é **types-only** (sem build) e define tipos compartilhados por
**todo o monorepo**: o `apps/server`, o `apps/admin` e — importante — os pacotes
`@systembook/connector` e `@systembook/preview-kit`, que são pensados para serem
publicáveis e consumidos pelos times de design system.

Por isso, ao propor mudanças em `packages/schema`:

- **Chame a mudança explicitamente na descrição do PR** — ela pode quebrar
  qualquer um dos consumidores acima.
- Como o pacote é types-only, alguns valores de runtime que espelham esses tipos
  vivem **fora** dele e precisam ser mantidos em sincronia manualmente. Ao mudar
  um tipo canônico, verifique os espelhos:
  - `BLOCK_TYPES` em `apps/server/src/db/schema.ts` (runtime dos block types);
  - o schema zod de `PreviewConfig` em `packages/connector/src/preview-config-schema.ts`;
  - o mapeamento block→nó Tiptap, duplicado em
    `apps/server/src/blocks/serialize.ts` e
    `apps/admin/src/features/revisions/blocksToTiptapDoc.ts`.
- Rode `pnpm typecheck` (fan-out): ele pega a maior parte das quebras de contrato
  em compile-time em todos os pacotes de uma vez.

## Licença

Ao contribuir, você concorda que suas contribuições serão licenciadas sob a
licença [MIT](./LICENSE) do projeto.
