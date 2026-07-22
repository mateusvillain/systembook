# PRD — SystemBook: Plataforma de Documentação de Design Systems

## 1. Visão Geral, Objetivos e Critérios de Sucesso

**O que é:** plataforma open source, self-hosted, para documentação de design systems no estilo Material Design Docs / Atlassian Design System. Modelo CMS completo (backend real + banco de dados), não Git-based — diferente de soluções como Docusaurus ou Decap CMS.

**Problema que resolve:** hoje, times de design system dependem de engenharia (PR + deploy) para publicar ou corrigir conteúdo de documentação, ou usam ferramentas (Storybook) que têm bom preview de componente mas documentação de texto fraca, ou usam CMS/wikis genéricos que não têm live preview de componentes reais.

**Objetivos:**
- Designers/editores autônomos para editar conteúdo sem depender de dev, dia a dia.
- Live preview de componentes reais dentro da documentação, buildado no CI do time consumidor — não na instância da plataforma.
- Zero custo além da hospedagem: container único, sem serviços terceiros pagos.
- 1 instância = 1 design system (sem multi-tenancy no MVP).

**Critérios de sucesso (marcos de validação):**
1. Fim da Fase 3: utilizável internamente como CMS de documentação de texto (sem live preview) — valida que a dor "designer edita sem dev" está resolvida.
2. Fim da Fase 5: produto completo com live preview funcional — valida a proposta de valor central frente a Storybook/Zeroheight.
3. Fim da Fase 7: pronto para divulgação pública como projeto open source — alguém de fora consegue subir uma instância só com a documentação.
4. Fim da Fase 8: times de design system conseguem documentar convenções de uso (Dos and Don'ts) com o mesmo nível de riqueza visual dos outros blocos (cover opcional, incl. componente real embutido).
5. Fim da Fase 9: painel administrativo com aparência moderna e consistente (Tailwind + shadcn/ui), sem regressão funcional em nenhum fluxo existente.

## 2. Público-Alvo

Times de design system (designers, editores de conteúdo, e devs que mantêm a instância) em empresas ou projetos open source que querem documentação profissional sem depender de engenharia para cada edição de texto, e sem abrir mão de exemplos de componente reais e interativos.

## 3. Panorama Competitivo e Diferenciação

- **Storybook**: excelente preview de componente isolado, mas documentação de texto é fraca/manual (MDX editado por dev, sem CMS real).
- **Zeroheight**: bom para documentação + design tokens, mas é SaaS pago, não self-hosted, e o preview de componente real depende de integração/sync com Storybook.
- **Docusaurus / Decap CMS**: Git-based — cada edição de conteúdo é um commit/PR, o que ainda depende de fluxo técnico (mesmo que "sem código", exige Git).
- **Diferenciação do SystemBook**: CMS real (banco de dados, edição direta, sem PR) + live preview de componente real buildado no CI do próprio time (não replicado/sincronizado manualmente) + self-hosted e gratuito (sem custo de licença SaaS).

## 4. Features Principais e Funcionalidade Core

1. **Autenticação e papéis**: login local (email/senha), papéis `admin` e `editor`.
2. **Estrutura de navegação**: árvore `sections → pages → tabs` (ex: tab "Usage", "Code", "Accessibility").
3. **Editor de conteúdo rich text (Tiptap)**: blocos tipados (heading, paragraph, list, code, image, table, callout, component-embed, dos-donts — Fase 8), com autosave e revisões versionadas.
4. **Conector e harness de preview**: pacote instalado no repo do time consumidor, que builda `*.preview.tsx` no CI deles e envia o artefato estático para a instância.
5. **component-embed real**: dentro do editor e da doc publicada, renderiza iframe real do preview do componente, com seletor de variante e controles interativos.
6. **Visualização pública**: leitura navegável, com busca full-text e tema dark/light.

## 5. Decisões de Escopo Confirmadas Nesta Sessão

- **Permissões de estrutura (Fase 2)**: `editor` tem CRUD completo sobre `sections`/`pages`/`tabs`, no mesmo nível que `admin`. Não há distinção de permissão entre criar estrutura e editar conteúdo dentro dela.
- **Persistência do editor (Fase 3)**: autosave com debounce (recomendado: ~2s de inatividade) salva um rascunho do conteúdo, sem criar `revision`. Uma `revision` (snapshot completo) só é criada explicitamente na ação de "Publicar".
- **Fluxo de publicação**: editor publica direto, sem estado `pending_review` / aprovação (fora do escopo do MVP — listado no backlog V2).
- **Versionamento**: snapshot completo por revisão, sem diff/CRDT no MVP.
- **Serialização**: conteúdo salvo como JSON nativo do Tiptap (`editor.getJSON()`), mapeado para a estrutura de `Block` — não HTML.

## 6. Key User Flows

### 6.1 Bootstrap da instância
1. Time sobe a imagem Docker com `.env` preenchido (`SESSION_SECRET`, `ARGON2_SECRET`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`).
2. No primeiro start, script de seed cria o usuário admin inicial a partir das variáveis de ambiente.
3. Admin loga no painel pela primeira vez.

### 6.2 Gestão de usuários
1. Admin acessa "Usuários" no painel.
2. Admin cria um novo usuário, define email, senha inicial e papel (`admin`/`editor`).
3. Editor loga com as credenciais recebidas fora de banda (não há convite por email no MVP).

### 6.3 Montagem da estrutura de documentação
1. Admin ou editor cria uma `section` (ex: "Componentes").
2. Dentro da section, cria uma `page` (ex: "Button") com slug único.
3. Dentro da page, cria `tabs` (ex: "Usage", "Code", "Accessibility").
4. Estrutura aparece na sidebar em árvore, reordenável.

### 6.4 Edição de conteúdo
1. Editor abre uma tab, escreve conteúdo no editor Tiptap (texto, lista, tabela, callout).
2. Conteúdo é autosalvo como rascunho a cada pausa de digitação (debounce).
3. Editor insere um `component-embed`, seleciona componente/variante já publicados.
4. Editor clica "Publicar" → snapshot vira uma `revision`, conteúdo fica visível na doc pública.
5. Editor acessa histórico de revisões, pode visualizar e restaurar uma versão anterior.

### 6.5 Pipeline de preview de componente (fora da instância)
1. Time do design system escreve `button.preview.tsx` no próprio repo, com `PreviewConfig` (variantes, controles).
2. No CI do time (GitHub Actions), o `connector` descobre os arquivos `*.preview.tsx`, gera entrypoints sintéticos por variante, builda via Vite.
3. CI faz `POST` autenticado (token gerado no painel da instância) para `/api/previews`, enviando o artefato + `component_name` + `commit_sha`.
4. Instância versiona e armazena o artefato estático no volume, registra em `component_previews`.
5. Na doc, o `component-embed` referenciando esse componente passa a renderizar o artefato mais novo via iframe.

### 6.6 Leitura pública
1. Visitante navega pela árvore de seções/páginas/tabs (layout público, fora do modo de edição).
2. Visitante busca conteúdo via busca full-text (SQLite FTS5).
3. Visitante interage com preview de componente embutido (controles via `postMessage`).

## 7. Stack Técnica

| Camada | Tecnologia |
| --- | --- |
| Backend | Node.js + TypeScript + tRPC |
| ORM / Banco | Drizzle + SQLite |
| Painel (admin) | React + Tiptap |
| Auth | Local (email/senha), argon2, sessão via cookie `httpOnly` |
| Editor rich text | Tiptap (nodes customizados: `callout`, `component-embed`) |
| Build do painel | Vite |
| Deploy | Docker, container único |
| Conector (pacote instalado no repo do time) | TypeScript + Vite (harness de preview) |
| Monorepo | pnpm workspaces (ou Turborepo) |

**Justificativa**: stack já decidida pelo autor do plano — TypeScript ponta a ponta reduz fricção entre `packages/schema` compartilhado (tipos de `Block`/`PreviewConfig`) e os três consumidores (server, admin, connector). SQLite elimina dependência de serviço de banco externo, alinhado ao princípio de zero custo/self-hosted single-container.

## 8. Prerequisitos e Acesso

- **Acesso a banco de dados**: não aplicável a serviço externo — SQLite é um arquivo local, criado pela primeira migration no boot do container. Nenhuma verificação de conectividade externa é necessária.
- **MCPs necessários**: nenhum. Este é um projeto self-hosted sem integrações de terceiros pagas.
- **Serviços/documentação de terceiros necessários**: nenhum serviço pago. Documentação de referência (públicas, sem necessidade de conta): Drizzle ORM, tRPC, Tiptap, Vite, Docker, GitHub Actions, SQLite FTS5.
- **Variáveis de ambiente necessárias** (nomes documentados; valores reais preenchidos manualmente pelo usuário em `PROJECT_ROOT/.env.local`):
  - `PORT`: porta HTTP do servidor. Valor padrão sugerido (`3000`) já presente.
  - `DATABASE_PATH`: caminho do arquivo SQLite. Valor padrão sugerido (`./data/systembook.db`) já presente.
  - `SESSION_SECRET`: segredo para assinatura/criptografia do cookie de sessão; preencher manualmente.
  - `ARGON2_SECRET`: pepper adicional para hashing de senha; preencher manualmente.
  - `INITIAL_ADMIN_EMAIL`: email do admin criado pelo seed de bootstrap; preencher manualmente.
  - `INITIAL_ADMIN_PASSWORD`: senha inicial do admin de bootstrap; preencher manualmente.
- **Login/usuários de teste**: o único usuário necessário para começar é o admin de bootstrap, criado a partir de `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` no primeiro start. Usuários `editor` adicionais são criados pelo admin via painel, sem necessidade de fluxo de convite/email (fora do escopo do MVP).
- **Gaps de prerequisito em aberto**: nenhum bloqueio identificado — projeto não depende de nenhum serviço externo pago, banco remoto ou MCP para o MVP. Decisão: **prosseguir** sem gaps.

## 9. Modelo de Dados Conceitual

```
users (id, nome, email, senha_hash, criado_em)
sessions (id, user_id, expira_em)
memberships (user_id, role: admin | editor)   -- 1 instância = 1 design system, sem escopo extra

sections (id, titulo, ordem)
pages (id, section_id, titulo, slug, ordem)
tabs (id, page_id, titulo, ordem)              -- Usage, Code, Accessibility...
blocks (id, tab_id, tipo, conteudo_json, ordem) -- tipo: heading | paragraph | list | code | image | table | callout | component-embed

revisions (id, page_id, snapshot_json, autor_id, criado_em, mensagem?)

component_previews (id, component_name, variant_id, commit_sha, path_estatico, publicado_em)
```

Tipos de bloco no MVP: `heading`, `paragraph`, `list` (ordered/unordered), `code`, `image`, `table`, `callout`, `component-embed`.

## 10. Princípios de UI/UX

- Referências visuais: Material Design Docs, Atlassian Design System — tipografia cuidada, navegação por árvore lateral, tema dark/light.
- Painel de edição (admin) é uma superfície separada da visualização pública de leitura.
- Editor de conteúdo prioriza fluidez (autosave) sobre controle manual de save, para reduzir fricção de designers não-técnicos.
- Estado "sem preview disponível ainda" deve ser tratado explicitamente (componente referenciado mas nunca publicado) — nunca deixar iframe quebrado silenciosamente.
- Responsividade obrigatória na visualização pública; painel admin pode assumir uso desktop.

## 11. Considerações de Segurança

- Senhas hasheadas com argon2 (+ pepper via `ARGON2_SECRET`), nunca armazenadas em texto plano.
- Sessão via cookie `httpOnly`, com expiração e invalidação no logout.
- Middleware de autorização no tRPC distinguindo `admin`/`editor` em toda rota mutável.
- Upload de artefato de preview (`POST /api/previews`) autenticado via token gerado por instância (não é a mesma sessão de usuário — token de CI, revogável pelo admin).
- Nunca logar senhas, tokens ou segredos, mesmo em casos de erro.
- Comparação de senha em tempo constante (argon2 já trata isso nativamente).
- Artefatos estáticos de preview servidos com escopo restrito (sem permitir path traversal ao servir arquivos do volume).

## 12. Fases de Desenvolvimento / Marcos

```
Fase 0 (fundamentos)
   ↓
Fase 1 (auth) ──────┐
   ↓                │
Fase 2 (estrutura)  │
   ↓                │
Fase 3 (editor) ←───┘
   ↓
Fase 4 (conector/preview build) — pode ser desenvolvida em paralelo à Fase 3
   ↓
Fase 5 (integração preview no editor)
   ↓
Fase 6 (visualização pública/polimento)
   ↓
Fase 7 (empacotamento/lançamento)
   ↓
Fase 8 (bloco Dos and Don'ts) — nova funcionalidade pós-lançamento
   ↓
Fase 9 (modernização visual do painel, Shadcn) — independente de conteúdo, pode rodar em paralelo à Fase 8
   ↓
Fase 10 (redesign da interface inspirado no Zeroheight) — depende da Fase 9 (Tailwind/shadcn já estabelecidos)
```

- **Fase 0 — Fundamentos**: monorepo, Drizzle+SQLite, tRPC health-check, Dockerfile, docker-compose dev, CI do projeto.
- **Fase 1 — Autenticação e painel base**: hash argon2, login/logout, middleware admin/editor, gestão de usuários, reset manual de senha.
- **Fase 2 — Estrutura de navegação**: CRUD sections/pages/tabs, UI de árvore no painel, permissões (editor com CRUD completo, decisão confirmada).
- **Fase 3 — Editor de conteúdo**: Tiptap + extensões padrão + tabela + `callout` + `component-embed` (placeholder), serialização para blocks, autosave com debounce, revisions, histórico/restore.
- **Fase 4 — Conector e harness de preview**: `PreviewConfig` schema, `preview-kit` (mount + postMessage), `connector` CLI (descoberta + build Vite), endpoint de upload autenticado, gestão de token, exemplo de step de CI, rota de artefatos estáticos.
- **Fase 5 — Integração do preview**: `component-embed` renderiza iframe real, seletor de componente/variante, painel de controles interativos, página pública com os mesmos embeds, estado "sem preview disponível".
- **Fase 6 — Publicação e polimento**: layout público de leitura, busca full-text (FTS5), tema dark/light, landing customizável, responsividade.
- **Fase 7 — Empacotamento e lançamento**: imagem Docker publicada, docker-compose de produção, documentação de setup/CI/schema, README de posicionamento, CONTRIBUTING + licença, documentação de backup (Litestream).
- **Fase 8 — Bloco Dos and Don'ts**: novo tipo de bloco `dos-donts` no editor (variant `do`/`dont`, título, descrição rich-text, cover opcional — imagem ou `component-embed` real), com serialização, render público e busca full-text, seguindo o mesmo padrão dos blocos custom da Fase 3 (`callout`/`component-embed`).
- **Fase 9 — Modernização visual do painel (Shadcn)**: migração do painel admin (login, navegação, editor, telas de gestão) de estilo inline para Tailwind CSS + shadcn/ui, com lucide-react (ícones) e sonner (toasts). Escopo confirmado como admin-only — a doc pública mantém o tema CSS-vars da Fase 6 (TASK-55), que já é dedicado a prosa/leitura e não precisa de um design system de aplicação.
- **Fase 10 — Redesign da interface inspirado no Zeroheight**: evolui a estrutura visual do painel (não só componentes/estilos, como a Fase 9) para se aproximar da experiência de uma documentação final real, seguindo `plano-de-interface.md` e as referências visuais fornecidas pelo usuário. Introduz **Menu** como nova entidade de navegação **acima** de `sections` (hierarquia passa a ser `Menu → Seção → Página → Tab`): o nav central do header (ex. "Get started/Foundation/Components/Resources") passa a ser dirigido por menus, não por seções — cada menu tem sua própria árvore de seções na sidebar, que troca de conteúdo ao trocar de menu ativo. Cobre ainda: schema/migration de `menus` (com backfill de um menu padrão para as seções pré-existentes) + CRUD tRPC; tokens de design (espaçamento/raio/sombra/tipografia); header fixo com nav de menus (ações admin movidas para menu de usuário/configurações); sidebar simplificada a 2 níveis por menu (seção → página; tabs saem da árvore e passam a existir só dentro do editor da página); área principal centralizada com Section Header/breadcrumbs (agora incluindo o nível Menu)/metadados; toolbar contextual de blocos no editor; menu de ações contextuais (⋮) na sidebar (e reaproveitado para gestão de menus no header); empty states (incl. menu sem seções); busca global do admin (estrutura — agora incluindo menus — + conteúdo publicado); e responsividade (sidebar colapsável/drawer). Decisões confirmadas com o usuário: Menu é uma entidade nova (não um sinônimo de Seção); a sidebar filtra pelo menu ativo; seções existentes migram para um menu padrão criado automaticamente; remoção das tabs da árvore da sidebar; relocação dos links admin-only (Usuários/Tokens/Histórico global/Página inicial) para o menu de configurações/usuário no header. Escopo admin-only — a doc pública (`/docs/...`) não ganha um nível de navegação por menu nesta fase.

## 13. Suposições e Dependências

- Times consumidores já têm um repositório de componentes com CI configurável (GitHub Actions assumido como referência, mas não exclusivo).
- Não há requisito de suporte a múltiplos design systems por instância no MVP (1 instância = 1 design system).
- Não há fluxo de convite por email/SMTP no MVP — todo provisionamento de usuário é manual pelo admin.
- Backup do SQLite é responsabilidade operacional do time que hospeda a instância (fora do código da plataforma), documentado com sugestão de Litestream.
- Fora de escopo do MVP (backlog V2): leitura automática de `.stories.tsx`, inferência de variantes via AST, convite de usuário/esqueci-senha via SMTP, fluxo draft→review→publish, diff granular entre revisões, multi-tenancy.

## Índice de Requisitos (TASK-IDs)

`TASK-1` é reservado para verificação de prerequisitos. Requisitos de feature começam em `TASK-2` — ver `PROJECT_ROOT/.prd/tasks.json` para o índice completo e `PROJECT_ROOT/.prd/tasks/TASK-*.json` para as especificações detalhadas.
