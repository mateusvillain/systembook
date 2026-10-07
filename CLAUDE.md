# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Systembook: CMS open source self-hosted para documentação de design systems (estilo Material/Atlassian docs). Backend real (não Git-based), container Docker único, 1 instância = 1 design system. PRDs, épicos e tasks vivem no **Linear** (time Systembook, issues `SYS-NN`; cada iniciativa é um projeto com o PRD como documento). A pasta `.prd/` (PRD original, backlog legado `TASK-*` e o log do agente em `.prd/memory.md`) é **local e não versionada** (`.gitignore`) — se existir na máquina, leia o `memory.md` no início e mantenha-o atualizado; num clone novo ela não existe.

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

Monorepo pnpm: `apps/server` (Node http nativo + tRPC v11 + Drizzle/better-sqlite3), `apps/admin` (Vite + React 19 + React Router 7), `packages/schema` (tipos compartilhados, **types-only**), `packages/preview-kit` (runtime de montagem do preview no iframe), `packages/connector` (biblioteca que descobre e builda os `*.preview.tsx` do repo consumidor; o bin `systembook-connector` está depreciado), `packages/cli` (o CLI `systembook`: `previews` e os comandos do modo estático — SYS-97), `packages/content` (parser `.md/.mdx` → blocos, árvore de navegação e dados do site estático) e `packages/docs-site` (doc pública + renderização de conteúdo Tiptap, independentes da fonte de dados — SYS-90). `examples/static-docs` é o projeto de exemplo do modo estático (SYS-104), workspace privado buildado no CI; dentro do monorepo o bin `systembook` roda o fonte do CLI via tsx (`packages/cli/bin/systembook.mjs`; o publicado usa o `bin` do `publishConfig`).

Os pacotes são **empacotados para o npm** sob o escopo `@systembook` (SYS-44; `docs-site` entrou na SYS-90 e ainda não foi publicado). Dentro do monorepo o `exports` de cada um aponta para `src/` — sem build, os apps consomem o fonte. O que muda no pacote publicado vive em `publishConfig` (`exports`/`types`/`bin` → `dist/`), substituído pelo pnpm no `pack`/`publish`; o `workspace:^` das dependências internas vira semver real pelo mesmo mecanismo. Então **`pnpm pack` é obrigatoriamente `pnpm pack`, nunca `npm pack`** — o npm não faz nenhuma dessas duas substituições e produziria um tarball quebrado. `pnpm build` emite `dist/` via `tsconfig.build.json` em cada pacote.

Fluxo de tipos: `AppRouter` é exportado de `apps/server/src/trpc/router.ts` e consumido pelo admin via `@systembook/server` (export `types` aponta direto ao fonte). O client usa `@trpc/tanstack-react-query` (`createTRPCContext` → `TRPCProvider`/`useTRPC` em `apps/admin/src/lib/trpc.ts`); o QueryCache/MutationCache global redireciona qualquer UNAUTHORIZED para `/login`.

Server: `src/index.ts` monta tRPC em `/trpc`, roda migrations no boot (`db/migrate.ts`), roda o seed e serve o build do admin (`static.ts`). Migrations em `apps/server/drizzle/` são geradas por `db:generate` — nunca editadas à mão. O server usa `@systembook/content/tokens` em runtime (validação do `POST /api/tokens`, SYS-142): no Dockerfile o `content` é buildado antes e, depois do `pnpm deploy`, `scripts/apply-publish-config.mjs` aplica o `publishConfig` dos pacotes copiados (o deploy leva o `exports` → `src/`, que o Node não executa em `node_modules`). Os demais pacotes do workspace continuam fora do runtime do server (a serialização de blocos é cópia com teste de paridade).

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
- `@systembook/docs-site`: os componentes importam o próprio CSS (`content.css`, `public.css`) e o `build` copia os `.css` para o `dist/` (o `tsc` não copia). O Tailwind do admin só enxerga o pacote pelo `@source` em `apps/admin/src/index.css`; o app do build estático (`packages/cli/app`) recebe o mesmo `@source` no build (plugin `docsSiteSource`, caminho absoluto, porque o pacote mora num lugar diferente em cada gerenciador), e os tokens do shadcn do painel de controles estão espelhados em `packages/cli/app/styles.css`. A doc pública lê dados só via `DocsDataSource` (contrato em `@systembook/schema`); o adaptador do modo CMS é `apps/admin/src/lib/trpcDataSource.ts`.
