# Memória do projeto — SystemBook

> Log de desenvolvimento mantido pelo agente. Última atualização: **2026-07-19** (Fase 3 concluída — tasks 25–36: editor Tiptap, nós custom, blocks, autosave, revisions, publish e histórico/restore. Próxima: Fase 4, preview).

## Estado atual

**Tasks 1–36 concluídas e verificadas.** Fase 0 (fundação), Fase 1 (auth + painel base), Fase 2 (estrutura de navegação + matriz de permissões) e Fase 3 (editor Tiptap completo com persistência, autosave, publish e histórico/restore de revisões) fechadas. Existe um `CLAUDE.md` na raiz com o guia do repositório. Próxima fase: Fase 4 (conector e harness de preview, TASK-37+).

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
| TASK-17 | ✅ | Tabela `sections` (migration 0001); ordem renumerada pela aplicação |
| TASK-18 | ✅ | `sections.list/create/rename/reorder/delete` com testes (reorder valida lista completa) |
| TASK-19 | ✅ | Tabela `pages` (migration 0002) com unique `(section_id, slug)` |
| TASK-20 | ✅ | `pages.*` incl. `updateSlug` (CONFLICT) e reorder escopado à seção |
| TASK-21 | ✅ | Tabela `tabs` (migration 0003); título livre, duplicata permitida (MVP) |
| TASK-22 | ✅ | `tabs.*` espelhando pages sem slug; helper compartilhado de reorder |
| TASK-23 | ✅ | SidebarTree no painel verificada via Playwright (12 cenários E2E) |
| TASK-24 | ✅ | Matriz documentada em `router.ts`; `permissions.test.ts` trava editor=CRUD estrutura, users.* FORBIDDEN |
| TASK-25 | ✅ | ContentEditor (Tiptap v3) montado na rota da tab; instância nova por tab (E2E) |
| TASK-26 | ✅ | Heading 1-3, bold/italic, listas, code block + toolbar com estado ativo (E2E) |
| TASK-27 | ✅ | Tabela 3×3 com header, +/− linha/coluna contextuais; JSON confere com schema (E2E) |
| TASK-28 | ✅ | Nó custom `callout` (info/warning/tip) com NodeView React e switcher in-place (E2E) |
| TASK-29 | ✅ | Nó atômico `componentEmbed` placeholder com attrs componentName/variantId (E2E) |
| TASK-30 | ✅ | Tabela `blocks` (migration 0004) + helpers tipados; round-trip dos 8 tipos testado |
| TASK-31 | ✅ | `serialize.ts` doc↔blocks + router `blocks.getByTab`; round-trip dos 8 tipos com marks/attrs |
| TASK-32 | ✅ | Autosave com debounce 2s, indicador Salvando…/Salvo, flush no unmount (16 checks E2E) |
| TASK-33 | ✅ | Tabela `revisions` (migration 0005) com `autor_id` SET NULL; tipo `PageSnapshot` no schema |
| TASK-34 | ✅ | `pages.publish` cria snapshot via `buildPageSnapshot`/`createRevision`; flush de tab ativa antes do publish (Playwright) |
| TASK-35 | ✅ | `/pages/:id/history` lista revisões (autor + timestamp), preview read-only por revisão (Playwright) |
| TASK-36 | ✅ | `pages.restoreRevision` transacional (skip de tabs removidas), cria revisão de acompanhamento; restore verificado via Playwright |
| TASK-37 | ✅ | `PreviewConfig` final em `packages/schema` (variants + união discriminada de controls text/boolean/select); JSDoc com contrato do `*.preview.tsx` |
| TASK-38 | ✅ | `preview-kit` `mount()` com variantes, erro para variantId desconhecida, postMessage com allow-list de origin; 7 testes vitest+jsdom |

**Cobertura**: 73 testes vitest no server (`pnpm --filter @systembook/server test`, todos verdes) + verificações E2E Playwright: 29 do editor base, 12 dos nós custom, 16 do autosave e o fluxo completo de publish/histórico/restore (scripts ad-hoc no scratchpad, não commitados), além das 12 da árvore.

O tracking granular (pass por step) está em `.agent/tasks/TASK-*.json` e o índice em `.agent/tasks.json`.

### Fases da PRD × Tasks (`.agent/prd/PRD.md` §12)

| Fase | Tasks | Status | Conteúdo |
| --- | --- | --- | --- |
| 0 — Fundamentos | TASK-1..8 | ✅ | monorepo, schema, Drizzle+SQLite, tRPC health-check, Dockerfile, compose, CI |
| 1 — Auth e painel base | TASK-9..16 | ✅ | argon2, login/cookie, middleware admin/editor, tela de login, gestão de usuários, reset de senha, logout |
| 2 — Estrutura de navegação | TASK-17..24 | ✅ | data models e CRUD de sections/pages/tabs, árvore na sidebar, permissões editor=admin |
| 3 — Editor de conteúdo | TASK-25..36 | ✅ | Tiptap + extensões + tabela + callout + component-embed placeholder, blocks, serialização, autosave, revisions, publish, histórico/restore |
| 4 — Conector e preview | TASK-37..46 | 🔄 (37–38 ✅) | PreviewConfig schema, preview-kit, connector CLI (discovery/entrypoints/build via Vite), component_previews, upload endpoint autenticado, tokens, exemplo CI, rota de artefatos estáticos |
| 5 — Integração do preview | TASK-47..51 | ⬜ | component-embed com iframe real, seletor componente/variante, painel de controles, doc pública com embeds, estado "sem preview disponível" |
| 6 — Publicação e polimento | TASK-52..57 | ⬜ | layout público, busca full-text FTS5 + UI, tema dark/light, landing customizável, responsividade |
| 7 — Empacotamento e lançamento | TASK-58..64 | ⬜ | imagem Docker publicada, compose de produção, docs de setup/CI/schema, README, CONTRIBUTING+licença, docs de backup |

Critérios de sucesso do PRD (§1): fim da Fase 3 = CMS de texto utilizável sem dev (✅ atingido); fim da Fase 5 = live preview funcional (proposta de valor central); fim da Fase 7 = pronto para divulgação open source.

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

## Estrutura de navegação (Fase 2)

- **Tabelas**: `sections (id, titulo, ordem)`, `pages (id, section_id, titulo, slug, ordem)` com unique `(section_id, slug)`, `tabs (id, page_id, titulo, ordem)` — migrations 0001–0003. FK cascade em toda a árvore; deletar seção leva pages/tabs (e blocks/revisions futuros).
- **`ordem`**: inteiro renumerado pela aplicação a cada reorder (0..n-1 dentro do pai), sem unique index; leitura ordena por `(ordem, id)` para desempate. `reorder` exige a lista **completa** de ids do pai (parcial/repetida/estranha → BAD_REQUEST) — validação no helper compartilhado `src/trpc/routers/reorder.ts`.
- **Permissões**: sections/pages/tabs usam `protectedProcedure` (admin E editor, decisão TASK-24 do PRD); users continua `adminProcedure`. `isUniqueViolation` foi extraído para `src/db/errors.ts`.
- **Slug**: `slugSchema` (`^[a-z0-9]+(-[a-z0-9]+)*$`) exportado de `pages.ts`, compartilhado entre `create` e `updateSlug`; violação de unique vira CONFLICT.
- **Admin**: `SidebarTree` (`apps/admin/src/features/navigation/`) na lateral do `AdminLayout` — colapsável por nível, criar/renomear inline, reorder por botões ↑/↓ (drag-and-drop adiado), exclusão via `window.confirm` avisando do cascade. Tab clicada navega para `/pages/:pageId/tabs/:tabId` (`TabContentPage`, placeholder até a Fase 3). Pages/tabs são buscadas lazy ao expandir o pai (`listBySection`/`listByPage` por nó).

## Editor Tiptap (Fase 3, TASK-25/26/27)

- **Tiptap v3 (3.28)** em `apps/admin/src/features/editor/` — `ContentEditor.tsx` + `EditorToolbar.tsx` + `editor.css`. Montado em `TabContentPage` com `key={tabId}` (instância nova por tab; conteúdo ainda **não persiste** — autosave/blocks nas TASK-31/32).
- **Sem StarterKit de propósito** (nota da TASK-26): set intencional de extensões espelhando os block types do PRD — Document/Paragraph/Text, Heading (níveis 1–3), Bold, Italic, BulletList/OrderedList/ListItem (pacote consolidado `@tiptap/extension-list` no v3), CodeBlock, Table/TableRow/TableHeader/TableCell (`@tiptap/extension-table`, `resizable`), UndoRedo/Dropcursor/Gapcursor (`@tiptap/extensions`). Strike, blockquote, HR etc. ficam fora até o schema de blocks mudar.
- **Toolbar**: estados ativos via `useEditorState` — no Tiptap v3 `useEditor` **não** re-renderiza a cada transação por padrão. Botões usam `onMouseDown={preventDefault}` para não roubar a seleção. Controles de tabela (±linha/±coluna) só aparecem com o cursor dentro de uma tabela.
- A instância ativa é exposta em `window.systembookEditor` (para E2E/automação — ex.: `getJSON()`).
- **Gotcha de E2E headless**: a sync da seleção nativa do browser → estado ProseMirror é assíncrona; dblclick/Shift+setas não refletem em `state.selection` a tempo. Para testar atalhos sobre seleção, criar a seleção com `setTextSelection` programático e então mandar o atalho de teclado.
- JSON de tabela confirmado contra `TableBlockContent` do schema (cabe em `body: TiptapJson`); forma documentada em `packages/schema/src/block.ts`.

### Nós custom (TASK-28/29)

- `nodes/Callout.tsx` e `nodes/ComponentEmbed.tsx` — padrão estabelecido: extensão `Node.create` + NodeView React (`ReactNodeViewRenderer`/`NodeViewWrapper`/`NodeViewContent`) no mesmo arquivo, attrs espelhados em `data-*` no parse/renderHTML. Este é o modelo para nós futuros (preview real na TASK-47).
- **Callout**: `content: 'block+'`, attr `variant` (info/warning/tip, arrays/meta exportados como `CALLOUT_VARIANTS`/`CALLOUT_META`); toolbar tem picker de 3 botões (info primeiro = default) e o NodeView tem switcher in-place via `updateAttributes` (preserva conteúdo). **Gotcha**: `:focus-within` não funciona para mostrar controles em NodeView — o foco fica no host `.ProseMirror`, não no nó; o switcher fica sempre visível com opacity baixa + hover.
- **ComponentEmbed**: `atom: true`, attrs `componentName: ''`/`variantId: null`; placeholder tracejado até TASK-47/48. Clicar gera NodeSelection (em asserts E2E usar `selection.node?.type.name`, nunca `constructor.name` — o build minificado renomeia classes).
- Nota: o schema permite `componentEmbed`/`callout` aninhados dentro de callout (`block+`) — aceito no MVP; o `focus('end')` dentro de um callout insere aninhado, cuidado em scripts.

### Persistência e autosave (TASK-31/32/33)

- **Serialização** em `apps/server/src/blocks/serialize.ts` (funções puras, server não depende de @tiptap/*): `tiptapDocToBlocks` mapeia cada nó top-level para uma linha (`bulletList`/`orderedList` → tipo `list`; `codeBlock` → `code` estruturado `{language, code}`; `componentEmbed` → attrs estruturados; heading/paragraph/callout guardam `content` em `body`; list/table guardam o **nó completo** em `body` para preservar attrs como `start`/`colwidth`). `blocksToTiptapDoc` inverte ordenando por `ordem`. Nó desconhecido → `UnknownNodeTypeError` → BAD_REQUEST no router. **Gotcha TS**: `TiptapNode`/`TiptapDoc` são type aliases, não interfaces — interfaces não são atribuíveis ao shape com index signature inferido pelo zod (`z.looseObject`).
- **Router `blocks`**: `getByTab` (retorna `{doc, blocks}`; `doc: null` se a tab nunca foi salva) e `saveDraft` (delete+insert transacional via `replaceBlocksForTab`; **nunca** toca revisions — separação autosave × publish testada). Ambos protectedProcedure, matriz em router.ts atualizada.
- **Autosave no admin** (`ContentEditor.tsx`): outer component carrega `getByTab` com `gcTime: 0` (sem cache entre montagens — o flush do unmount anterior pode ter mudado o rascunho) e monta `EditorInner` com o doc inicial; `onUpdate` → debounce 2s → `saveDraft`; indicador `data-save-status` (saving/saved/idle/error, aria-live); flush fire-and-forget no unmount quando há debounce pendente. Refs (`pendingDocRef`/`flushRef`) evitam closures velhas dentro do `useEditor` (deps `[tabId]`).
- **Gotcha de NodeView + caret**: ao inserir callout com o cursor num parágrafo não-vazio, o `setTextSelection` muda o estado PM mas o **caret do DOM não entra** no NodeView React (monta assíncrono; o selectionToDOM não reposiciona depois) — a digitação segue o caret e cai fora do nó. Solução na toolbar: após inserir, posicionar `Range` do DOM manualmente via `view.domAtPos` com retry em rAF até o contentDOM existir (`insertCallout` em `EditorToolbar.tsx`).
- **revisions** (migration 0005): `id, page_id FK cascade, snapshot_json, autor_id FK SET NULL (nullable!), criado_em, mensagem?`. Desvio deliberado do esboço da task (que dizia notNull): usuários sofrem hard delete e a revisão sobrevive com autor null — decisão antiga da TASK-14 aplicada. `snapshot_json` = `PageSnapshot` de @systembook/schema (página inteira: todas as tabs + blocks), pois Publicar é ação de página.
- **`pages.publish` (TASK-34)**: único ponto de escrita em `revisions` (helpers `buildPageSnapshot`/`createRevision` em `src/db/revisions.ts`). Monta o snapshot lendo `tabs` + `listBlocksByTab` por tab; `BlockRecord` (`tipo`/`conteudo`) é remapeado para `Block` (`type`/`content`) com um cast — os literais batem 1:1, só o nome dos campos muda. `autorId` vem de `ctx.user.userId`, nunca do input. Página inexistente → NOT_FOUND.
- **Admin**: botão "Publicar" vive em `TabContentPage.tsx` (nível de página, não de tab) — `ContentEditor` virou `forwardRef<ContentEditorHandle>` expondo `flush(): Promise<void>` (a antiga função fire-and-forget do autosave virou `mutateAsync` aguardável); `handlePublish` faz `await editorRef.current?.flush()` antes de `pages.publish.mutate` para não snapshotar um rascunho desatualizado da tab ativa (as outras tabs já persistiram via autosave ao trocar de rota). Feedback via banner `role="status"`/`role="alert"` (mesmo padrão do `UsersPage`).
- **Verificado via Playwright** (script ad-hoc no scratchpad, server buildado servindo `apps/admin/dist` na porta 3210): editar 2 tabs, digitar mais uma vez sem esperar o debounce de 2s e clicar Publicar imediatamente — a revisão criada contém a edição de última hora (confirma o guard de flush do step 3). Só 1 revisão por publish, `autor_id` correto.
- Pendência real para a TASK-50 (documentada no spec da TASK-34): o read path público deve ler da última revisão, não de `blocks` ao vivo — ordering dependency entre as duas tasks.

### Histórico de revisões + restore (TASK-35/36)

- **TASK-36 (restore) foi implementada junto com a TASK-35**: a UI de histórico não dava para verificar em browser sem um endpoint de restore funcional, então adiantei o `pages.restoreRevision` mesmo a TASK-35 listando só TASK-34 como dependência formal.
- **`db/revisions.ts`**: `restoreRevision(db, { pageId, targetRevision, autorId })` roda tudo numa única transação — substitui os blocks de cada tab ainda existente (via `replaceBlocksForTabInTx`, nova função extraída de `replaceBlocksForTab` para não aninhar `db.transaction()`, que o better-sqlite3/drizzle não suporta) e, ao final, cria uma revisão de acompanhamento lendo o estado já restaurado (`buildPageSnapshot(tx, pageId)` dentro da mesma tx) com `mensagem: "Restaurado da revisão de {ISO date}"`. Histórico continua append-only — restore nunca reescreve revisões antigas.
- **Tab drift**: tabs do snapshot alvo que não existem mais na página são puladas (não é erro) e retornadas em `skippedTabIds` — decisão MVP documentada no próprio código.
- **`Db`/`DbTx`** (novo tipo em `db/client.ts`): `DbTx = Parameters<Parameters<Db['transaction']>[0]>[0]` — usado sempre que uma função precisa rodar dentro de uma transação já aberta por quem chama (ex.: `listBlocksByTab`, `buildPageSnapshot`, `replaceBlocksForTabInTx` aceitam `Db | DbTx`).
- **Router `revisions`** (novo, `src/trpc/routers/revisions.ts`): `listByPage` (leftJoin com `users` para o email do autor — `autor_id` pode ser null; **desempate de ordenação por `sql`${revisions}.rowid`` além de `criadoEm` desc**, porque `criadoEm` só tem resolução de segundo e publishes rápidos em sequência empatavam) e `getById` (snapshot completo parseado). `pages.restoreRevision` ficou em `pages.ts` (mesmo router do `publish`), não em `revisions.ts`, seguindo o texto literal do spec da TASK-36.
- **Admin**: `editorExtensions` foi extraído de `ContentEditor.tsx` para `features/editor/extensions.ts` (single source of truth do conjunto de nodes/marks), reaproveitado pelo preview read-only de revisões. `features/revisions/blocksToTiptapDoc.ts` **duplica** deliberadamente o mapeamento block→nó de `apps/server/src/blocks/serialize.ts` — não dá pra importar direto do server (fronteira de pacote/runtime, mesma razão do `@systembook/schema` ser types-only); qualquer mudança no mapeamento canônico (`packages/schema/src/block.ts`) precisa espelhar nos dois lugares.
- **Gotcha de tipos tRPC v11 sem transformer**: o output inferido pelo client não é o tipo de domínio puro (`PageSnapshot`, `Block`) — o tRPC aplica um `Serialize<T>` interno que marca campos `unknown`/possivelmente-undefined como opcionais e (provavelmente) `Date` como string. Componentes que recebem dados de query devem tipar a partir de `RouterOutput` (novo export em `apps/admin/src/lib/trpc.ts`, via `inferRouterOutputs<AppRouter>` — precisou adicionar `@trpc/server` como devDependency do admin só para o tipo), não do tipo de domínio importado de `@systembook/schema`; um cast (`as Block[]`) é necessário na borda onde o valor "solto" do wire é passado para uma função que espera o tipo de domínio exato.
- **Rota**: `/pages/:pageId/history` (não `/admin/pages/:pageId/history` como o texto do spec sugeria) — decisão deliberada para consistência com a rota irmã `/pages/:pageId/tabs/:tabId` (o prefixo `/admin/` no código existente é reservado à área de gestão de usuários, `admin/users`). Link "Histórico" adicionado ao lado do botão Publicar em `TabContentPage`.
- **Verificado via Playwright**: publicar v1, editar e publicar v2, abrir `/pages/:id/history`, ver as 2 revisões (mais recente primeiro, com email do autor e timestamp), selecionar a mais antiga → preview read-only mostra só o conteúdo da v1, clicar Restaurar → `window.confirm` → navega de volta para `/pages/:id/tabs/:tabId` → editor mostra o conteúdo restaurado da v1.

### Modelo de blocks (TASK-30)

- Tabela `blocks (id, tab_id FK cascade, tipo, conteudo_json, ordem)` — migration 0004. `tipo` validado **na aplicação** (decisão TASK-30): array `BLOCK_TYPES` em `schema.ts` com `satisfies readonly BlockType[]` + assert de exaustividade nas duas direções, e zod enum `blockTypeSchema` em `src/db/blocks.ts`; sem CHECK no SQLite (crescer o set pós-MVP não exige migration). O array de runtime vive no server porque `@systembook/schema` é types-only.
- Helpers tipados em `src/db/blocks.ts`: `insertBlock`/`listBlocksByTab` fazem stringify/parse de `conteudo_json`; `BlockRecord` é union discriminada por `tipo` com `conteudo` tipado via `Extract<Block, { type: T }>['content']`. Código chamador nunca vê JSON cru.

## O que existe hoje

- **Monorepo**: `apps/server`, `apps/admin`, `packages/schema`, `packages/preview-kit` (placeholder até TASK-37), `packages/connector` (placeholder até TASK-40). Scripts raiz `build/dev/lint/typecheck/test` fazem fan-out com `pnpm -r --if-present`.
- **Server** (`apps/server`): Node http nativo + tRPC v11 montado em `/trpc`; valida env fail-fast (`src/env.ts`); roda migrations no boot (`src/db/migrate.ts`); seed de bootstrap idempotente (`src/db/seed.ts`); serve o build estático do admin (`src/static.ts`, princípio do container único). Dev: `pnpm dev` (tsx watch com `--env-file-if-exists=../../.env.local`).
- **Banco**: better-sqlite3 + Drizzle. Tabelas `users`, `sessions`, `memberships` (migration `drizzle/0000_*.sql`). IDs são UUID. Banco local de dev em `apps/server/data/systembook.db` — admin de bootstrap já criado nele (e também no volume docker `systembook_sqlite-data`).
- **Admin** (`apps/admin`): Vite + React 19 com login, layout protegido com nav + "Sair", dashboard placeholder e gestão de usuários (criar, trocar role, remover, redefinir senha). Proxy `/trpc` no dev server.
- **Testes**: vitest em `apps/server` — `seed.test.ts`, `auth/password.test.ts`, `trpc/auth.test.ts`, `trpc/structure.test.ts` (40 testes). E2E: Playwright (root devDep) com script ad-hoc contra server em porta 3210 + banco temporário e credenciais de teste.
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

## Fase 4 — Conector e preview (em andamento, branch `feature/fase-4-conector-preview`)

- **TASK-37 (PreviewConfig)**: tipo final em `packages/schema/src/preview-config.ts` substituiu o placeholder da TASK-3. `PreviewVariant {id, label, props}`, `PreviewControl` = união discriminada por `kind` (`text`/`boolean`/`select`, cada um com `propName`, `label?` e `defaultValue?` tipado; `select` tem `options: string[]`). Contrato do `*.preview.tsx` documentado em JSDoc: default export `satisfies PreviewConfig` + export nomeado `Preview(props)` que o harness monta. Nenhum outro código importava o placeholder ainda (o `componentEmbed` da TASK-29 não usa o tipo).
- **TASK-38 (preview-kit mount)**: `packages/preview-kit/src/mount.tsx` — `mount(rootElement, config, Component, {variantId, allowedOrigin?})` retorna `PreviewHandle {unmount}`. React/react-dom são **peerDependencies** (^19) — o pacote é bundlado pelo connector no artefato do time (TASK-41), que traz o próprio React; devDeps duplicam para os testes. `@systembook/schema` deixou de ser types-only *no consumo*: o contrato postMessage vive em `packages/schema/src/preview-messages.ts` (`PreviewUpdatePropsMessage {type: 'systembook:update-props', props}`, união `PreviewMessage`) — só tipos, o literal de runtime `UPDATE_PROPS_MESSAGE_TYPE` é exportado pelo preview-kit (mesma razão do `BLOCK_TYPES` viver no server). O painel de controles da TASK-49 deve importar o tipo do schema e o literal… de onde fizer sentido (admin não depende de preview-kit; repetir o literal com o tipo anotado é aceitável).
- **Validação de origin no mount**: `allowedOrigin` explícita > origin do `document.referrer` > `window.location.origin`. Mensagem de origin errada → `console.warn` e ignora; shape estranho → ignora em silêncio (sem warn — pode ser message de outra lib no iframe).
- **Gotchas de teste (vitest+jsdom+React 19)**: `// @vitest-environment jsdom` no docblock dispensa vitest.config; `(globalThis).IS_REACT_ACT_ENVIRONMENT = true` + `act` importado de `react` (não react-dom/test-utils); `MessageEvent('message', {origin})` aceita origin sintética no jsdom. O `exports` do preview-kit ganhou `"default": "./src/index.ts"` (fonte TS direto — o consumidor bundla; ok para Vite do connector e vitest, **não** ok para Node puro).

## Pendências / próximos passos

1. **Fase 3 concluída (TASK-30 a 36)**: modelo de blocks, autosave, publish/snapshot e histórico/restauração de revisões todos prontos. Fase 4 em andamento na branch `feature/fase-4-conector-preview` — TASK-37 e 38 feitas; próxima é a TASK-39 (connector CLI: descoberta de `*.preview.tsx`).
2. Race conhecido (aceito no MVP): flush de autosave no unmount × fetch do `getByTab` na remontagem — em navegação muito rápida ida-e-volta o editor pode abrir sem o último flush (o dado não se perde no banco; basta recarregar).
3. `.pnpm-store/` local (criado pelo container de dev) está no `.gitignore`; pode ser apagado à vontade.

## Avisos de segurança registrados

- `.gitignore` criado em 2026-07-19 cobrindo `.env.local`, `data/`, `*.db`, `.pnpm-store/` — o primeiro commit do repo é ele, garantindo que nenhum segredo entrou no histórico.
- A `INITIAL_ADMIN_PASSWORD` do usuário ficou exposta no chat de uma sessão (arquivo anexado). Recomendado ao usuário: trocar a senha no `.env.local` por uma mais forte e recriar os bancos de dev (`rm -rf apps/server/data` + `docker volume rm systembook_sqlite-data`) antes de uso real; a tela de login já existe, então a troca pode (e deve) ser feita a qualquer momento — ainda **pendente de confirmação do usuário**.
- Os valores de `SESSION_SECRET`/`ARGON2_SECRET` foram gerados via `openssl rand -base64 32` direto no arquivo, sem passar pelo chat/logs.
