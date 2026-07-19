# Memória do projeto — SystemBook

> Log de desenvolvimento mantido pelo agente. Última atualização: **2026-07-19** (tarde — fase de setup concluída).

## Estado atual

**Tasks 1–8 concluídas e verificadas.** Fase de setup/fundação fechada; próxima é a TASK-9 (argon2).

| Task | Status | Verificação |
| --- | --- | --- |
| TASK-1 | ✅ | `.env.local` completo (segredos gerados via openssl, sem passar pelo chat) |
| TASK-2 | ✅ | `pnpm install` ok, linking `workspace:*` resolvendo |
| TASK-3 | ✅ | `Block`/`PreviewConfig` importados por server e admin, `tsc --noEmit` limpo |
| TASK-4 | ✅ | Migration cria as 3 tabelas; seed idempotente testado (vitest + banco real) |
| TASK-5 | ✅ | `GET /trpc/health.check` → 200 `{status:'ok',db:'ok'}`; fail-fast de env ok |
| TASK-6 | ✅ | `docker build` ok; imagem responde health 200 e serve o admin; admin criado no volume |
| TASK-7 | ✅ | `docker compose up` → health em ~20s; ciclo down/up preserva dados sem duplicar seed |
| TASK-8 | ✅ | CI verde na main; branch com erro de lint proposital falhou exatamente no step Lint |

O tracking granular (pass por step) está em `.agent/tasks/TASK-*.json` e o índice em `.agent/tasks.json`.

## Git / CI

- Histórico inicial: **14 commits Conventional Commits** na `main` (chore/build/feat/test/ci), pushados para `github.com/mateusvillain/systembook`.
- CI (GitHub Actions): Node 24, pnpm via campo `packageManager`, steps separados Lint → Typecheck → Test. **Gotcha corrigido**: `pnpm/action-setup@v4` não aceita `version:` no workflow quando `package.json` tem `packageManager` — deixar só o `packageManager`.
- Branch de teste `ci-test/lint-failure` foi criado e removido (local + remoto) após validar a falha seletiva do lint.

## O que existe hoje

- **Monorepo**: `apps/server`, `apps/admin`, `packages/schema`, `packages/preview-kit` (placeholder até TASK-37), `packages/connector` (placeholder até TASK-40). Scripts raiz `build/dev/lint/typecheck/test` fazem fan-out com `pnpm -r --if-present`.
- **Server** (`apps/server`): Node http nativo + tRPC v11 montado em `/trpc`; valida env fail-fast (`src/env.ts`); roda migrations no boot (`src/db/migrate.ts`); seed de bootstrap idempotente (`src/db/seed.ts`); serve o build estático do admin (`src/static.ts`, princípio do container único). Dev: `pnpm dev` (tsx watch com `--env-file-if-exists=../../.env.local`).
- **Banco**: better-sqlite3 + Drizzle. Tabelas `users`, `sessions`, `memberships` (migration `drizzle/0000_*.sql`). IDs são UUID. Banco local de dev em `apps/server/data/systembook.db` — admin de bootstrap já criado nele (e também no volume docker `systembook_sqlite-data`).
- **Admin** (`apps/admin`): Vite + React 19 mínimo, proxy `/trpc` no dev server. Painel real começa na TASK-10+.
- **Testes**: vitest em `apps/server` (`src/db/seed.test.ts`) — seed cria 1 admin, idempotência, health-check via `createCaller`.
- **Infra**: `Dockerfile` multi-stage (imagem `systembook:dev` buildada e smoke-testada), `docker-compose.yml` de dev (verificado com ciclo up/down), CI verde.

## Decisões técnicas tomadas

- **better-sqlite3** (não libsql) como driver — exigiu `pnpm.onlyBuiltDependencies` no `package.json` raiz (pnpm 10 bloqueia build scripts nativos por padrão).
- **Hash provisório com scrypt** (`node:crypto`) + pepper de `ARGON2_SECRET`, formato `scrypt$<salt>$<hash>` — **deve ser trocado por argon2id na TASK-9**; o prefixo permite detectar e re-hashear no primeiro login.
- **`@systembook/schema` é types-only**: `exports` aponta direto para `src/index.ts` (sem build/dist) — zero dependência de runtime, exigência para o connector publicável.
- **`pnpm deploy` precisa de `--legacy`** no pnpm 10 (sem workspace injection) — ok porque a única dep de workspace do server é types-only.
- **ESLint 9 flat config** único na raiz (`eslint.config.mjs`); cada pacote roda `eslint src`. Regra `no-unused-vars` ignora prefixo `_`.
- **NodeNext** no server/packages (imports relativos com extensão `.js`); `bundler` no admin (Vite).
- No driver síncrono do better-sqlite3, `insert().returning()` precisa de `.get()`/`.all()` — destructuring direto do builder não compila.
- CI usa `pnpm -r --if-present run <script>` porque nem todo pacote tem todos os scripts.
- No compose de dev, `environment:` sobrepõe `env_file:` — usado para apontar `DATABASE_PATH` ao volume `/data` dentro do container.

## Pendências / próximos passos

1. **TASK-9**: argon2id real substituindo o hash scrypt provisório do seed (re-hash no primeiro login usando o prefixo do formato).
2. TASK-10+: auth/sessões, painel de login, gestão de usuários.
3. `.pnpm-store/` local (criado pelo container de dev) está no `.gitignore`; pode ser apagado à vontade.

## Avisos de segurança registrados

- `.gitignore` criado em 2026-07-19 cobrindo `.env.local`, `data/`, `*.db`, `.pnpm-store/` — o primeiro commit do repo é ele, garantindo que nenhum segredo entrou no histórico.
- A `INITIAL_ADMIN_PASSWORD` do usuário ficou exposta no chat de uma sessão (arquivo anexado). Recomendado ao usuário: trocar a senha no `.env.local` por uma mais forte e recriar os bancos de dev (`rm -rf apps/server/data` + `docker volume rm systembook_sqlite-data`) antes de uso real; a senha do admin também deve ser trocada assim que a tela de login existir.
- Os valores de `SESSION_SECRET`/`ARGON2_SECRET` foram gerados via `openssl rand -base64 32` direto no arquivo, sem passar pelo chat/logs.
