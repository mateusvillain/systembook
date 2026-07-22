# Fase 10 — Redesign de interface (inspirado no Zeroheight)

> Contexto de apoio para quem for implementar TASK-82..93. Não substitui os
> specs (`.prd/tasks/TASK-82.json`..`TASK-93.json`) nem o plano de design
> (`plano-de-interface.md`, raiz do repo) — é o "porquê" e as decisões de
> arquitetura que ficariam perdidas numa conversa. Leia também `MEMORY.md`
> (busque por "Fase 10") para o estado de execução mais recente.

## Motivação

A interface do CMS (painel admin) precisava deixar de parecer um painel
administrativo genérico e passar a se parecer com a documentação final que
ela produz — mais fiel, mais "real", no espírito de ferramentas como
Zeroheight, Notion, Linear e Figma. Pedido original do usuário: a estrutura
visual (não só componentes/cores, como já foi feito na Fase 9 com
Tailwind+shadcn) precisava mudar — layout, hierarquia, navegação.

Fontes de verdade para o design:

- **`plano-de-interface.md`** (raiz do repo) — princípios, layout de 3
  regiões, hierarquia tipográfica, tokens visuais, o que evitar.
- **`referencia.png`** — screenshot do Zeroheight mostrando o layout-alvo:
  header fixo com nav central + sidebar com grupos em caixa-alta + área
  principal centralizada com eyebrow/título/descrição/metadados.
- **`referencia-2.png`** — o menu de inserção de bloco ("/" ou "+") que
  serve de referência visual para a TASK-88 (toolbar de blocos).

## A decisão de arquitetura: Menu como entidade nova

O ponto mais delicado da fase, decidido em conversa com o usuário
(confirmado explicitamente, não inferido): o nav central do header no
Zeroheight ("Get started", "Foundation", "Components", "Resources") **não é
a mesma coisa** que os grupos da sidebar ("OVERVIEW", "STYLE", "COMPONENTS",
"RESOURCES" — que aparecem todos juntos sob um único item do nav). Isso só
faz sentido se o nav do topo for um nível hierárquico **acima** do que hoje
chamamos de `sections`.

Hierarquia **antes** da Fase 10:

```
Section (topo, sidebar + o que seria o nav do header) → Page → Tab
```

Hierarquia **depois** da Fase 10:

```
Menu (novo — nav central do header) → Section (grupo da sidebar) → Page → Tab
```

Implicações confirmadas com o usuário:

- `Menu` é uma tabela nova (`menus`), não um sinônimo/rename de `sections`.
- `sections.menuId` passa a ser **obrigatório** (NOT NULL) — uma seção sempre
  pertence a um menu.
- Trocar de menu no header **troca o conteúdo da sidebar inteira** (a
  sidebar sempre mostra as seções do menu ativo, nunca a árvore inteira de
  todos os menus ao mesmo tempo).
- Seções que já existiam no banco antes da Fase 10 migram automaticamente
  para **um menu padrão** ("Documentação"), criado por um backfill idempotente
  no boot (mesmo padrão já usado para slugs nas Fases 6/9) — ninguém perde
  conteúdo, ninguém precisa reorganizar manualmente antes de continuar
  usando o painel.
- **Escopo admin-only**: a doc pública (`/docs/...`) não ganha um nível de
  navegação por menu nesta fase — assim como a Fase 9 (Shadcn) foi
  admin-only e não tocou `.sb-public`, o Menu é uma camada organizacional
  do painel, não (ainda) do lado publicado.

## Outras decisões confirmadas

- **Tabs saem da árvore da sidebar.** Hoje `SidebarTree` renderiza 3 níveis
  (Seção → Página → Tab). O plano é explícito ("Tabs devem existir apenas
  dentro da página. Nunca na árvore.") — a partir da TASK-86, a sidebar tem
  só 2 níveis (Seção → Página); a gestão de tabs (criar/renomear/excluir)
  migra para dentro do editor da página (o tab-bar que já existe em
  `PageContentPage.tsx`, TASK-67), não desaparece.
- **Links admin-only saem do header central.** Usuários, Tokens, Histórico
  global e Página inicial (configurações) deixam de ser itens soltos no nav
  e passam a viver num menu de usuário/configurações à direita do header —
  o header central fica dedicado a navegação de conteúdo (menus), nunca a
  ações administrativas.
- **Capacidades sem lastro no backend ficam de fora, deliberadamente.**
  Duplicar página/seção/menu e mover uma seção entre menus aparecem no
  exemplo do plano ("Página ⋮ Renomear / Duplicar / Mover / Excluir"), mas
  não existe mutation para isso hoje. Em vez de construir UI para uma
  capacidade que a API não tem, essas ações foram propositalmente omitidas
  dos menus contextuais (TASK-89) e documentadas como gap conhecido — não é
  esquecimento.
- Busca (TASK-91) cobre estrutura (menus/seções/páginas/tabs) + conteúdo
  publicado (reusando a FTS5 da TASK-53). Busca por componentes/tokens/
  usuários, também citada no plano, ficou fora do escopo — sem uma entidade
  indexável correspondente hoje.

## Ordem de execução recomendada

```
TASK-82 (tokens visuais)               ─┐  independentes entre si
TASK-83 (schema+migration do Menu)     ─┘
        ↓
TASK-84 (CRUD tRPC do Menu)
        ↓
TASK-85 (header: nav de menus + criação/gestão de menu)
        ↓
TASK-86 (sidebar: 2 níveis, escopada ao menu ativo, remove tabs)
        ↓
TASK-87 (área principal: Section Header + breadcrumbs c/ nível Menu)
        ↓
TASK-88 (toolbar contextual de blocos no editor — a mais técnica)
        ↓
TASK-89 (menu ⋮ contextual na sidebar; TASK-85 pode reaproveitar o padrão)
        ↓
TASK-90 (empty states, incl. "menu sem seções")
        ↓
TASK-91 (busca global do admin, incl. menus)
        ↓
TASK-92 (responsivo: sidebar colapsável/drawer, reaproveitando a TASK-57)
        ↓
TASK-93 (QA final da fase — inclui um passo dedicado ao Menu)
```

TASK-82 e TASK-83 não têm dependência entre si e podem ser feitas em
qualquer ordem/paralelo. As demais seguem a cadeia acima porque cada uma
consome algo que a anterior estabelece (tokens, entidade Menu, header como
fonte do "menu ativo", sidebar como fonte da árvore).

## Riscos e pontos de atenção

- **TASK-85 e TASK-86 tiveram a complexidade revisada para `high`** depois
  que o Menu foi confirmado como entidade nova — cada uma passou a carregar
  tanto o reskin visual quanto a mudança estrutural (gestão de menu no
  header; escopo por menu ativo na sidebar). Se for preciso dividir em
  sub-entregas, a TASK-86 já vem com essa sugestão no `technicalNotes`.
  Já a TASK-83 (schema/migration) foi separada da TASK-84 (CRUD) seguindo o
  padrão já usado no projeto (ex.: TASK-17/18 para sections originalmente).
- **Migration com coluna NOT NULL em tabela não-vazia**: `sections.menuId`
  precisa nascer preenchido para todas as linhas existentes. A TASK-83 já
  aponta o caminho (nullable → backfill → tightening, ou o que
  `db:generate` propuser) — não editar a migration gerada à mão, por
  convenção do projeto (`CLAUDE.md`).
- **"Menu ativo" precisa de uma fonte única de verdade** (TASK-85 decide o
  mecanismo — provavelmente derivado da página aberta, já que toda página
  pertence a uma seção que pertence a um menu). TASK-86, TASK-87, TASK-89 e
  TASK-91 todos dependem dessa decisão estar bem definida e documentada
  antes de serem implementadas.
- Ao final da fase, o critério de "pronto" é a **TASK-93**, que inclui um
  passo dedicado só ao walkthrough do Menu (criar/trocar/excluir menu com
  cascade) além do QA visual e do fan-out completo (`lint`/`typecheck`/
  `test`).

## Onde mais olhar

- `plano-de-interface.md` — o design em si.
- `.prd/PRD.md` §12 — Fase 10 no panorama geral das fases do projeto.
- `.prd/tasks.json` + `.prd/tasks/TASK-82.json`..`TASK-93.json` — specs
  completos (acceptance criteria, steps, dependencies).
- `.prd/MEMORY.md` — log de execução; procure "Fase 10" para o estado mais
  recente e por decisões tomadas durante a implementação.
