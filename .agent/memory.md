# Memória do projeto — SystemBook

> Log de desenvolvimento mantido pelo agente. Última atualização: **2026-07-19** (noite — Fases 0 e 1 concluídas).

## Estado atual

**Tasks 1–16 concluídas e verificadas.** Fase 0 (fundação) e Fase 1 (auth + painel base) fechadas; próxima é a Fase 2 (estrutura de navegação, TASK-17+).

| Task | Status | Verificação |
| --- | --- | --- |
| TASK-1..8 | ✅ | Fase 0 — ver histórico do git e seções abaixo |
| TASK-9 | ✅ | argon2id + pepper; testes de hash/verify/salt aleatório/legado scrypt |
| TASK-10 | ✅ | `auth.login` seta cookie httpOnly; erro genérico anti-enumeração testado |
| TASK-11 | ✅ | `protectedProcedure`/`adminProcedure`; sessão expirada limpa a linha no acesso |
| TASK-12 | ✅ | Tela de login verificada via Playwright (erro inline, redirect, guard) |
| TASK-13 | ✅ | `/admin/users` com lista + criação; editor vê "Acesso negado" (Playwright) |
| TASK-14 | ✅ | `users.list/create/update/deactivate` com testes de FORBIDDEN/CONFLICT/self-block |
| TASK-15 | ✅ | Reset de senha invalida sessões; senha antiga falha e nova funciona (Playwright) |
| TASK-16 | ✅ | Logout limpa cookie; UNAUTHORIZED global redireciona para /login (Playwright) |

**Cobertura**: 24 testes vitest no server + 14 verificações E2E Playwright (script ad-hoc, não commitado).

O tracking granular (pass por step) está em `.agent/tasks/TASK-*.json` e o índice em `.agent/tasks.json`.

## Git / CI

- Histórico inicial: **14 commits Conventional Commits** na `main` (chore/build/feat/test/ci), pushados para `github.com/mateusvillain/systembook`.
- CI (GitHub Actions): Node 24, pnpm via campo `packageManager`, steps separados Lint → Typecheck → Test. **Gotcha corrigido**: `pnpm/action-setup@v4` não aceita `version:` no workflow quando `package.json` tem `packageManager` — deixar só o `packageManager`.
- Branch de teste `ci-test/lint-failure` foi criado e removido (local + remoto) após validar a falha seletiva do lint.

## Arquitetura de auth (Fase 1)

- **Hashing**: `apps/server/src/auth/password.ts` — argon2id (memoryCost 19456, timeCost 2) com pepper de `ARGON2_SECRET` concatenado antes do salt. `verifyPassword` também aceita hashes legados `scrypt$...` (do seed pré-TASK-9) e `needsRehash` sinaliza; o login re-hasheia transparentemente para argon2id.
- **Sessões**: cookie `session_id` httpOnly/SameSite=Lax/Path=/ (Secure em produção), 7 dias, linha em `sessions`. Cleanup preguiçoso: sessão expirada é deletada no acesso (sem cron).
- **Contexto tRPC**: `src/trpc/context.ts` resolve `{ userId, role, sessionId }` do cookie; `init.ts` expõe `protectedProcedure` (UNAUTHORIZED) e `adminProcedure` (FORBIDDEN) — ponto único de enforcement para todas as fases futuras.
- **Routers**: `auth` (login com erro genérico anti-enumeração, logout, me), `users` (list/create/update/deactivate/resetPassword, todos adminProcedure). Reset de senha deleta todas as sessões do alvo.
- **Decisão deactivate = hard delete** (sessions/memberships caem por FK cascade). ⚠️ Quando a tabela `revisions` for criada (Fase 3), `autor_id` deve ser nullable ou `ON DELETE SET NULL` para não quebrar com usuários removidos.
- **Admin panel**: React Router 7 (`/login`, `/` protegida, `/admin/users`), tRPC client via `@trpc/tanstack-react-query` (`createTRPCContext` → `TRPCProvider`/`useTRPC`), QueryCache/MutationCache global redirecionando UNAUTHORIZED → `/login`. `AppRouter` type importado de `@systembook/server` via `exports.types` apontando ao fonte (`src/trpc/router.ts`).

## O que existe hoje

- **Monorepo**: `apps/server`, `apps/admin`, `packages/schema`, `packages/preview-kit` (placeholder até TASK-37), `packages/connector` (placeholder até TASK-40). Scripts raiz `build/dev/lint/typecheck/test` fazem fan-out com `pnpm -r --if-present`.
- **Server** (`apps/server`): Node http nativo + tRPC v11 montado em `/trpc`; valida env fail-fast (`src/env.ts`); roda migrations no boot (`src/db/migrate.ts`); seed de bootstrap idempotente (`src/db/seed.ts`); serve o build estático do admin (`src/static.ts`, princípio do container único). Dev: `pnpm dev` (tsx watch com `--env-file-if-exists=../../.env.local`).
- **Banco**: better-sqlite3 + Drizzle. Tabelas `users`, `sessions`, `memberships` (migration `drizzle/0000_*.sql`). IDs são UUID. Banco local de dev em `apps/server/data/systembook.db` — admin de bootstrap já criado nele (e também no volume docker `systembook_sqlite-data`).
- **Admin** (`apps/admin`): Vite + React 19 com login, layout protegido com nav + "Sair", dashboard placeholder e gestão de usuários (criar, trocar role, remover, redefinir senha). Proxy `/trpc` no dev server.
- **Testes**: vitest em `apps/server` — `seed.test.ts`, `auth/password.test.ts`, `trpc/auth.test.ts` (24 testes). E2E: Playwright (root devDep) com script ad-hoc contra server em porta 3210 + banco temporário e credenciais de teste.
- **Infra**: `Dockerfile` multi-stage (imagem `systembook:dev` buildada e smoke-testada), `docker-compose.yml` de dev (verificado com ciclo up/down), CI verde.

## Fluxo de desenvolvimento local

Dois processos em dev:

- `pnpm dev` (raiz) → server (`tsx watch`, porta 3000): API tRPC, banco, sessões.
- `pnpm --filter @systembook/admin dev` → frontend com Vite na porta 5173, hot-reload dos componentes React.

O painel em dev acessa-se por `http://localhost:5173`; o proxy do `vite.config.ts` repassa `/trpc` para o server na 3000, mantendo tudo same-origin (cookies de sessão funcionam sem CORS). Sem o Vite rodando, `http://localhost:3000` também serve o painel, mas é o build estático de `apps/admin/dist` (último `pnpm build`, sem hot-reload) — exatamente o modo de produção do container único.

## Decisões técnicas tomadas

- **better-sqlite3** (não libsql) como driver — exigiu `pnpm.onlyBuiltDependencies` no `package.json` raiz (pnpm 10 bloqueia build scripts nativos por padrão).
- O seed pré-TASK-9 usava hash provisório scrypt (`scrypt$<salt>$<hash>`); desde a TASK-9 o hashing é argon2id e hashes legados são re-hasheados no primeiro login (ver "Arquitetura de auth").
- **`@systembook/schema` é types-only**: `exports` aponta direto para `src/index.ts` (sem build/dist) — zero dependência de runtime, exigência para o connector publicável.
- **`pnpm deploy` precisa de `--legacy`** no pnpm 10 (sem workspace injection) — ok porque a única dep de workspace do server é types-only.
- **ESLint 9 flat config** único na raiz (`eslint.config.mjs`); cada pacote roda `eslint src`. Regra `no-unused-vars` ignora prefixo `_`.
- **NodeNext** no server/packages (imports relativos com extensão `.js`); `bundler` no admin (Vite).
- No driver síncrono do better-sqlite3, `insert().returning()` precisa de `.get()`/`.all()` — destructuring direto do builder não compila.
- CI usa `pnpm -r --if-present run <script>` porque nem todo pacote tem todos os scripts.
- No compose de dev, `environment:` sobrepõe `env_file:` — usado para apontar `DATABASE_PATH` ao volume `/data` dentro do container.
- **zod 4** no server: usar `z.email()` (não `z.string().email()`, deprecado).
- Transações do better-sqlite3 são **estritamente síncronas** — `hashPassword` (async) precisa rodar antes de `db.transaction()`.
- O pepper em `password.ts` é lido lazy (cache no primeiro uso), não no module load — necessário para os testes que setam `ARGON2_SECRET` em `beforeEach`; `_resetPepperCacheForTests()` isola casos.
- E2E: playwright instalado como devDep da raiz + `playwright install chromium`; scripts ad-hoc no scratchpad importam playwright por caminho absoluto do node_modules.

## Pendências / próximos passos

1. **Fase 2 (TASK-17+)**: estrutura de navegação — CRUD de sections/pages/tabs, árvore no painel, permissões (editor tem CRUD completo de estrutura, decisão confirmada no PRD).
2. Quando criar `revisions` (Fase 3): `autor_id` nullable/`SET NULL` por causa do hard delete de usuários.
3. `.pnpm-store/` local (criado pelo container de dev) está no `.gitignore`; pode ser apagado à vontade.

## Avisos de segurança registrados

- `.gitignore` criado em 2026-07-19 cobrindo `.env.local`, `data/`, `*.db`, `.pnpm-store/` — o primeiro commit do repo é ele, garantindo que nenhum segredo entrou no histórico.
- A `INITIAL_ADMIN_PASSWORD` do usuário ficou exposta no chat de uma sessão (arquivo anexado). Recomendado ao usuário: trocar a senha no `.env.local` por uma mais forte e recriar os bancos de dev (`rm -rf apps/server/data` + `docker volume rm systembook_sqlite-data`) antes de uso real; a tela de login já existe, então a troca pode (e deve) ser feita a qualquer momento — ainda **pendente de confirmação do usuário**.
- Os valores de `SESSION_SECRET`/`ARGON2_SECRET` foram gerados via `openssl rand -base64 32` direto no arquivo, sem passar pelo chat/logs.
