# Publicando no Linear via MCP

Este arquivo só deve ser lido **depois** que o usuário aprovou o plano explicitamente
(ver "Passo 8" no SKILL.md). Ele mapeia cada ação necessária para o tipo de tool MCP do
Linear que você deve procurar/usar no seu ambiente.

Os nomes exatos das tools variam por ambiente/versão do servidor MCP do Linear (podem
aparecer como `mcp__linear__save_issue`, `Linear:save_issue`, `linear_create_issue`,
etc.). Antes de publicar, liste as tools MCP disponíveis relacionadas a "Linear" no seu
ambiente e confirme os nomes e parâmetros reais — não assuma que o nome abaixo é literal,
use-o como descrição da capacidade que você está procurando.

## Ordem de publicação (importante — respeite esta ordem)

1. **Resolver o Team** (ver seção "Configuração de Team" no SKILL.md — já deve estar
   resolvido antes de chegar aqui).
2. **Document (PRD)** — criar/atualizar o documento com o conteúdo do PRD já aprovado.
   Capacidade equivalente a `save_document` / `create_document`. Guarde o `id` ou `slug`
   retornado — ele será referenciado nas Epics.
3. **Project** — verificar se já existe um Project com o nome da feature (capacidade
   `list_projects`). Se não existir, criar um (`save_project`/`create_project`),
   associando ao Team resolvido. Se já existir, use-o em vez de duplicar — pergunte ao
   usuário rapidamente se está em dúvida entre projetos parecidos.
4. **Epics (Parent Issues)** — criar uma Issue por Epic (`save_issue`/`create_issue`),
   associada ao Project, contendo o conteúdo formatado do template de Epic no corpo/
   descrição. Guarde o `id` de cada Epic criada.
5. **Sub-Issues** — criar cada Issue filha (`save_issue`/`create_issue`) apontando o
   `parentId`/`parent` para o `id` da Epic correspondente, com o conteúdo do template de
   Issue no corpo/descrição.
6. **Dependências (`blocked by`)** — depois que TODAS as issues de uma leva foram criadas
   (para já ter os `id`s reais), aplicar as relações de bloqueio entre elas. Isso
   normalmente é um `update_issue`/`save_issue` adicionando uma relação do tipo "blocks"/
   "blocked by", ou uma tool dedicada de relations se existir. Sempre criar a relação na
   direção correta: se a Issue B está "blocked by" A, o relacionamento deve deixar claro
   que A precisa terminar primeiro.

## Regras de segurança nessa etapa

- **Nunca execute nada desta seção sem a aprovação explícita do usuário no Passo 7.**
  Se o usuário pedir mudanças depois de ver o resumo, volte e ajuste o plano — não
  publique parcialmente "para adiantar".
- Se qualquer chamada falhar no meio do processo (ex: criou as Epics mas falhou nas
  Issues), pare, informe exatamente o que já foi criado (com links/ids) e o que faltou,
  e pergunte como o usuário quer prosseguir. Não tente "auto-corrigir" duplicando ou
  recriando itens sem confirmação.
- Ao final, apresente um resumo com os links reais dos itens criados no Linear (Document,
  Project, Epics, Issues), não só uma repetição do plano original.
