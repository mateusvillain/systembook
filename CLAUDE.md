# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

SystemBook: CMS open source self-hosted para documentação de design systems (estilo Material/Atlassian docs). Backend real (não Git-based), container Docker único, 1 instância = 1 design system. PRD completo em `.prd/PRD.md` (resumo em `.prd/SUMMARY.md`); backlog em `.prd/tasks.json` com specs por task em `.prd/tasks/TASK-*.json` (campo `passes` marca conclusão). O log de desenvolvimento vivo do agente fica em `.prd/memory.md` — leia-o no início e mantenha-o atualizado.

## Comandos

Tudo via pnpm (v10, campo `packageManager`). Scripts da raiz fazem fan-out com `pnpm -r --if-present`.

```bash
pnpm dev                                  # server em watch na porta 3000 (tsx, carrega ../../.env.local)
pnpm --filter @systembook/admin dev       # painel admin com Vite/hot-reload na porta 5173 (proxy /trpc → 3000)
pnpm build / lint / typecheck / test      # fan-out em todos os pacotes
pnpm --filter @systembook/server test     # vitest só do server
pnpm --filter @systembook/server exec vitest run src/trpc/auth.test.ts   # um arquivo de teste
pnpm --filter @systembook/server db:generate   # drizzle-kit generate (nova migration a partir do schema.ts)
pnpm --filter @systembook/server db:seed       # seed do admin de bootstrap (idempotente)
```

Em dev use `http://localhost:5173` (Vite + proxy same-origin, cookies funcionam). `http://localhost:3000` serve o último build estático de `apps/admin/dist` — o modo produção do container único.

O server exige `PORT`, `DATABASE_PATH`, `SESSION_SECRET` (validação fail-fast em `src/env.ts`) — vêm de `.env.local` na raiz (não commitado). Banco de dev: `apps/server/data/systembook.db`.

## Arquitetura

Monorepo pnpm: `apps/server` (Node http nativo + tRPC v11 + Drizzle/better-sqlite3), `apps/admin` (Vite + React 19 + React Router 7), `packages/schema` (tipos compartilhados, **types-only**: `exports` aponta para `src/`, sem build), `packages/preview-kit` e `packages/connector` (placeholders até as fases de preview).

Fluxo de tipos: `AppRouter` é exportado de `apps/server/src/trpc/router.ts` e consumido pelo admin via `@systembook/server` (export `types` aponta direto ao fonte). O client usa `@trpc/tanstack-react-query` (`createTRPCContext` → `TRPCProvider`/`useTRPC` em `apps/admin/src/lib/trpc.ts`); o QueryCache/MutationCache global redireciona qualquer UNAUTHORIZED para `/login`.

Server: `src/index.ts` monta tRPC em `/trpc`, roda migrations no boot (`db/migrate.ts`), roda o seed e serve o build do admin (`static.ts`). Migrations em `apps/server/drizzle/` são geradas por `db:generate` — nunca editadas à mão.

Auth: cookie `session_id` httpOnly + linha em `sessions` (cleanup preguiçoso no acesso; sem cron). `src/trpc/init.ts` define `protectedProcedure` (UNAUTHORIZED) e `adminProcedure` (FORBIDDEN) — ponto único de enforcement; roles são `admin` e `editor`, e **ambos têm CRUD completo da estrutura de navegação** (sections/pages/tabs usam `protectedProcedure`; gestão de usuários usa `adminProcedure`). Hashing argon2id com pepper (`ARGON2_SECRET`) em `src/auth/password.ts`; o pepper é lido lazy (testes setam env em `beforeEach` e chamam `_resetPepperCacheForTests()`).

Testes do server (vitest) usam o padrão de `src/trpc/auth.test.ts`: banco SQLite temporário por teste + `runMigrations` + `appRouter.createCaller` com contexto forjado (sem HTTP).

## Convenções e gotchas

- Nomes de domínio em português (`titulo`, `ordem`, `senha_hash`, `criadoEm`); IDs são UUID (`crypto.randomUUID`) via `$defaultFn`.
- better-sqlite3 é síncrono: `insert().returning()` exige `.get()`/`.all()`; `db.transaction()` é estritamente síncrono — faça `await` (ex.: `hashPassword`) **antes** de abrir a transação.
- zod 4: `z.email()`, não `z.string().email()`.
- TypeScript NodeNext no server/packages → imports relativos com extensão `.js`; admin usa `moduleResolution: bundler`.
- ESLint 9 flat config único na raiz (`eslint.config.mjs`); `no-unused-vars` ignora prefixo `_`.
- Violações de UNIQUE do SQLite são capturadas por mensagem (`UNIQUE constraint failed`) e re-lançadas como `TRPCError CONFLICT`.
- Deleção é hard delete com FK cascade em todo o domínio (decisão do MVP). Quando a tabela `revisions` existir, `autor_id` deve ser nullable/`ON DELETE SET NULL`.
- Commits seguem Conventional Commits, com mensagens em português.
- CI (GitHub Actions): não adicionar `version:` ao `pnpm/action-setup` — conflita com o campo `packageManager`.
