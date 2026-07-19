# Plano de Execução — Plataforma de Documentação de Design Systems

## Visão Geral

Plataforma open source, self-hosted, para documentação de design systems no estilo Material Design / Atlassian, sem dependência de time de engenharia para o dia a dia de edição de conteúdo. Modelo CMS completo (backend real + banco), não Git-based.

**Princípios norteadores:**

- Zero custo além da hospedagem (container único, sem serviços terceiros pagos)
- Designers/editores autônomos para editar conteúdo sem depender de dev
- Live preview de componentes reais, buildado no CI do time (não na instância da plataforma)
- 1 instância = 1 design system (sem multi-tenancy)

---

## Stack Técnica (decidida)

| Camada                            | Tecnologia                                                 |
| --------------------------------- | ---------------------------------------------------------- |
| Backend                           | Node.js + TypeScript + tRPC                                |
| ORM / Banco                       | Drizzle + SQLite                                           |
| Painel (frontend admin)           | React + Tiptap                                             |
| Auth                              | Local (email/senha), argon2, sessions via cookie           |
| Editor rich text                  | Tiptap (nodes customizados para callout e component-embed) |
| Build do painel                   | Vite                                                       |
| Deploy                            | Docker, container único                                    |
| Conector (pacote no repo do time) | TypeScript + Vite (harness de preview)                     |

---

## Modelo de Dados (base)

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

**Tipos de bloco no MVP:** `heading`, `paragraph`, `list` (ordered/unordered), `code`, `image`, `table`, `callout`, `component-embed`.

**Serialização:** conteúdo salvo como JSON nativo do Tiptap (`editor.getJSON()`), mapeado para a estrutura de `Block` acima — não HTML.

**Versionamento:** snapshot completo por revisão (sem diff/CRDT no MVP).

**Publicação:** editor publica direto, sem fluxo de aprovação (sem estado `pending_review`).

---

## Fase 0 — Fundamentos do Projeto

**Objetivo:** preparar a base técnica antes de qualquer feature de produto.

- [ ] Criar monorepo (ex: pnpm workspaces ou Turborepo) com pacotes separados:
  - `apps/server` (backend tRPC)
  - `apps/admin` (painel React)
  - `packages/schema` (tipos compartilhados: `Block`, `PreviewConfig`, etc.)
  - `packages/preview-kit` (harness/runtime de preview)
  - `packages/connector` (pacote publicável que o time instala no repo do design system)
- [ ] Configurar Drizzle + SQLite, primeira migration (`users`, `sessions`, `memberships`)
- [ ] Configurar tRPC básico (rota de health-check)
- [ ] Dockerfile inicial (multi-stage: build do painel + build do server, resultado em imagem única)
- [ ] `docker-compose.yml` de desenvolvimento local
- [ ] CI do próprio projeto (lint, typecheck, testes) via GitHub Actions

**Critério de saída:** `docker-compose up` sobe um container vazio, respondendo health-check, com banco criado.

---

## Fase 1 — Autenticação e Painel Base

**Objetivo:** acesso funcional com papéis, sem features de conteúdo ainda.

- [ ] Hash de senha com argon2
- [ ] Login (email/senha) → sessão via cookie `httpOnly`
- [ ] Middleware de autenticação/autorização (admin vs. editor) no tRPC
- [ ] Tela de login no painel
- [ ] Tela de gestão de usuários (admin cria usuário diretamente, define senha inicial, define papel)
- [ ] Reset de senha manual (admin edita usuário, define nova senha) — sem fluxo de email
- [ ] Logout / expiração de sessão

**Critério de saída:** admin consegue logar, criar um editor, editor consegue logar com papel restrito.

---

## Fase 2 — Estrutura de Navegação (Seções, Páginas, Tabs)

**Objetivo:** dar forma à árvore de conteúdo, sem editor de texto ainda.

- [ ] CRUD de `sections` (criar, reordenar, renomear, deletar)
- [ ] CRUD de `pages` dentro de uma section (com slug único)
- [ ] CRUD de `tabs` dentro de uma page (Usage, Code, Accessibility, custom)
- [ ] UI de navegação em árvore no painel (sidebar estilo Material/Atlassian docs)
- [ ] Permissões: admin gerencia estrutura; definir se editor pode criar páginas ou só editar conteúdo existente (decisão de escopo a confirmar)

**Critério de saída:** admin monta a árvore completa de um design system fictício (seções → páginas → tabs), navegável no painel, sem conteúdo ainda.

---

## Fase 3 — Editor de Conteúdo (Tiptap)

**Objetivo:** editor rich text funcional, salvando como blocos tipados.

- [ ] Integração base do Tiptap no painel
- [ ] Extensões padrão: heading, paragraph, bold/italic, listas, code block
- [ ] Extensão de tabela
- [ ] Node customizado: `callout` (variantes: info, warning, tip)
- [ ] Node customizado: `component-embed` (placeholder nesta fase — sem preview real ainda, só o slot reservado)
- [ ] Serialização `editor.getJSON()` → `blocks` no banco
- [ ] Autosave ou salvar manual (decisão de UX a confirmar)
- [ ] Criação de `revisions` (snapshot a cada publicação)
- [ ] Tela de histórico de revisões por página (visualizar, restaurar snapshot anterior)

**Critério de saída:** editor escreve uma página completa (texto, lista, tabela, callout), salva, revisão é registrada, consegue restaurar uma versão anterior.

---

## Fase 4 — Conector e Harness de Preview

**Objetivo:** pipeline de build de preview funcionando de ponta a ponta, fora da instância principal.

- [ ] Definir schema `PreviewConfig` (`component`, `variants`, `controls`) no `packages/schema`
- [ ] Implementar `packages/preview-kit`: função `mount()` que lê `PreviewConfig`, renderiza variantes, escuta `postMessage` para trocar props
- [ ] Implementar `packages/connector`: CLI/script que:
  - Descobre arquivos `*.preview.tsx` no repo do time
  - Gera entrypoints sintéticos por variante
  - Builda via Vite → artefato estático (HTML/JS/CSS)
- [ ] Endpoint autenticado no backend: `POST /api/previews` (recebe artefato + `component_name` + `commit_sha`, versiona e armazena no volume)
- [ ] Geração/gestão de token de upload por instância (admin gera token no painel, usado no CI do time)
- [ ] Exemplo de step de CI (GitHub Actions) documentado, pronto para copiar/colar no repo do time
- [ ] Servir os artefatos estáticos via rota própria do backend (para uso em iframe)

**Critério de saída:** um componente de exemplo, com `button.preview.tsx`, builda no CI de um repo de teste e o artefato aparece disponível na instância via commit.

---

## Fase 5 — Integração do Preview no Editor e na Doc Publicada

**Objetivo:** fechar o ciclo — o `component-embed` do editor vira preview real, tanto na edição quanto na página publicada.

- [ ] `component-embed` no Tiptap passa a renderizar iframe real (apontando para o artefato mais recente do componente/variante referenciado)
- [ ] Seletor de componente/variante ao inserir um `component-embed` (busca nos `component_previews` já publicados)
- [ ] Painel de controles interativos ao lado do preview (lendo `controls` do `PreviewConfig`, via `postMessage`)
- [ ] Página pública (visualização final, fora do modo de edição) renderizando os mesmos embeds
- [ ] Tratamento de estado "sem preview disponível ainda" (componente referenciado mas nunca publicado)

**Critério de saída:** uma página de documentação publicada mostra um componente real interativo, atualizado automaticamente a cada novo merge no repo do time.

---

## Fase 6 — Publicação, Visualização Pública e Polimento

**Objetivo:** experiência de leitura final, no nível "documentação profissional".

- [ ] Layout público de leitura (separado do painel de edição) — navegação por seções/páginas/tabs
- [ ] Busca simples de conteúdo (full-text sobre `blocks`, mesmo que básica via SQLite FTS5)
- [ ] Tema visual (dark/light, tipografia cuidada — referência: Material Design Docs, Atlassian Design System)
- [ ] Página inicial / landing da documentação (customizável pelo admin)
- [ ] Responsividade da visualização pública

**Critério de saída:** documentação publicada é navegável, pesquisável e visualmente comparável às referências citadas (Material, Atlassian).

---

## Fase 7 — Empacotamento, Deploy e Documentação do Projeto

**Objetivo:** deixar o projeto pronto para adoção por terceiros (é open source).

- [ ] Imagem Docker publicada (Docker Hub / GHCR)
- [ ] `docker-compose.yml` de produção de referência
- [ ] Documentação de setup: instalar conector no repo, configurar CI, subir instância, criar primeiro admin
- [ ] Documentação do schema `*.preview.tsx` com exemplos
- [ ] README com posicionamento claro do projeto (o que é, o que não é, comparação com Storybook/Zeroheight/Decap)
- [ ] Guia de contribuição (CONTRIBUTING.md), licença open source definida
- [ ] Backup do SQLite documentado como responsabilidade do time (sugestão: Litestream)

**Critério de saída:** uma pessoa de fora do projeto consegue, seguindo só a documentação, subir uma instância e conectar um repo próprio.

---

## Backlog para V2 (fora do escopo do MVP, já sinalizado)

- Leitura automática de `.stories.tsx` existentes (ponte de migração para quem já usa Storybook)
- Inferência automática de variantes via TypeScript AST (fallback sem `.preview.tsx` manual)
- Fluxo de convite de usuários (link com token) e "esqueci minha senha" (via SMTP configurável)
- Fluxo de draft → review → publish com aprovação (caso vire necessidade real)
- Diff granular entre revisões (em vez de snapshot completo)
- Suporte a múltiplos design systems por instância (caso surja demanda)

---

## Ordem de Dependência entre Fases

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
```

A Fase 4 (conector e harness) é tecnicamente independente do editor e pode ser desenvolvida em paralelo às Fases 2–3, já que não depende do painel — só do schema `PreviewConfig` definido antecipadamente.

---

## Marcos de Validação (checkpoints de produto)

1. **Fim da Fase 3**: já é usável internamente como CMS de documentação de texto (sem live preview) — validação de que a dor de "designer edita sem dev" está resolvida.
2. **Fim da Fase 5**: produto completo, com live preview funcional — validação da proposta de valor central frente a Storybook/Zeroheight.
3. **Fim da Fase 7**: pronto para divulgação pública como projeto open source.
