---
name: linear-planning
description: Transforma uma ideia de feature em linguagem natural em um plano de execução completo no Linear — PRD, Epics (Parent Issues) e Issues pequenas com dependências mapeadas para maximizar trabalho paralelo — e, após aprovação explícita do usuário, cria tudo automaticamente via Linear MCP (Document, Project, Parent Issues, Sub-Issues e relações "blocked by"). Use sempre que o usuário trouxer uma ideia de funcionalidade e pedir para planejar, quebrar em tarefas, criar issues/epics, documentar como PRD, ou organizar o trabalho no Linear — mesmo que ele não use a palavra "skill" ou não peça explicitamente um "PRD". Também use quando o pedido for algo como "cria as issues disso no Linear", "quebra essa ideia em epics", ou "monta o plano de execução pra essa feature".
---

# Planejamento de Features no Linear

Este skill conduz uma ideia de feature, ainda crua, até um plano de execução estruturado
e publicado no Linear — sem nunca pular a etapa de aprovação humana antes de escrever
qualquer coisa no Linear de verdade.

## Por que este fluxo existe

Planejar bem é mais do que quebrar trabalho em pedaços menores — é decidir onde estão as
dependências reais e onde não estão, para que o máximo de trabalho possa acontecer em
paralelo. A maior parte do valor deste skill está exatamente nisso: resistir ao instinto
de sequenciar tudo "porque é assim que eu faria sozinho", e em vez disso perguntar, para
cada dependência candidata, se ela é um bloqueio de fato (um artefato concreto que falta)
ou só um hábito de ordenação.

O PRD é a fonte da verdade do plano inteiro: Epics e Issues devem sempre remeter de volta
a alguma parte dele. Se durante a quebra em Issues você perceber que precisa de algo que
não está no PRD, é sinal de que o PRD ficou incompleto — volte e ajuste-o antes de seguir.

## Visão geral do fluxo

1. Receber a ideia em linguagem natural
2. Fazer perguntas para preencher lacunas de contexto
3. Gerar o PRD
4. Quebrar o PRD em Epics
5. Quebrar cada Epic em Issues
6. Mapear dependências (`blocked by`) otimizando para paralelismo
7. Mostrar o resumo do plano para aprovação
8. Após aprovação explícita, publicar tudo no Linear via MCP

Não pule etapas mesmo que o usuário pareça ter pressa — cada uma existe para evitar
retrabalho na etapa seguinte (perguntar antes do PRD evita reescrever o PRD depois de
pronto; aprovar antes de publicar evita lixo no Linear real).

## Passo 1-2: Ideia e perguntas de contexto

Leia a ideia do usuário e identifique lacunas antes de escrever qualquer coisa. As
seções do PRD que mais costumam vir vazias da ideia inicial são **Usuários**, **Critérios
de aceite** e **Fora do escopo** — presuma que vai precisar perguntar sobre pelo menos uma
delas, a menos que o usuário já tenha sido extremamente detalhado.

Faça perguntas objetivas e agrupadas (evite ida-e-volta de uma pergunta por vez quando dá
para perguntar tudo de uma vez). Bom sinal de que já pode seguir para o PRD: você
consegue preencher as 9 seções do template sem inventar nada que o usuário não disse ou
não confirmou.

Não pergunte sobre coisas que já são decidíveis a partir do contexto do repositório (ex:
stack técnica, convenções de código) — extraia isso sozinho quando possível, e reserve as
perguntas para decisões de produto que só o usuário pode tomar.

## Passo 3: Gerar o PRD

Use exatamente a estrutura em `references/prd-template.md`. Leia esse arquivo antes de
escrever o PRD — ele também tem orientação de como preencher cada seção a partir da
conversa.

Mostre o PRD gerado para o usuário como um checkpoint natural — se algo estiver errado
aqui, é muito mais barato corrigir agora do que depois de já ter Epics e Issues escritas
em cima dele. Você não precisa de uma aprovação formal nesse ponto (a aprovação formal é
no Passo 7), mas deixe claro que o usuário pode corrigir antes de continuar.

## Passo 4: Quebrar o PRD em Epics

Use `references/epic-template.md` para o formato e para os critérios de como fatiar bem
(fatias verticais/por capacidade, não por camada técnica).

Cada Epic deve remeter claramente a uma parte do PRD. Se uma Epic não conseguir apontar
para nenhuma seção específica do PRD, ela provavelmente não deveria existir — ou o PRD
está incompleto.

## Passo 5: Quebrar cada Epic em Issues

Use `references/issue-template.md`. Este é o passo mais fácil de fazer mal por pressa —
releia as "Regras para quebrar uma Epic em Issues" nesse arquivo antes de gerar a lista,
principalmente a regra de tamanho (uma unidade de trabalho por issue) e a de paralelismo.

## Passo 6: Mapear dependências

Depois que todas as Issues de todas as Epics existirem (ainda como plano, não publicadas),
faça uma segunda passada só para dependências:

1. Para cada Issue, pergunte: "existe algum artefato concreto (schema, endpoint, decisão,
   componente) que essa Issue precisa e que só vai existir depois de outra Issue estar
   pronta?" Se sim, marque `blocked by`. Se a resposta for só "faz mais sentido depois",
   **não** marque.
2. Depois de mapear tudo, identifique explicitamente quais Issues **não têm nenhum
   bloqueio** — essas são o conjunto que pode começar imediatamente e em paralelo. Esse
   conjunto deve aparecer destacado no resumo do Passo 7; é geralmente a informação mais
   acionável do plano inteiro.
3. Dependências podem cruzar Epics (uma Issue de uma Epic pode ser `blocked by` uma Issue
   de outra Epic) — não restrinja o mapeamento à Epic atual.

## Passo 7: Resumo para aprovação

Apresente um resumo compacto e escaneável, não o plano inteiro reformatado por extenso.
Estrutura sugerida:

```
## Resumo do plano: [Nome da feature]

**PRD:** [1 linha do objetivo]

**Epics (N):**
1. [Nome da Epic] — N issues
2. ...

**Issues sem bloqueio (podem começar já — N):**
- [Issue] (Epic X)
- ...

**Cadeia de dependências:**
- [Issue B] blocked by [Issue A]
- ...

**Total: N Epics, N Issues**
```

Pergunte explicitamente se pode publicar no Linear. Aceite qualquer forma clara de "sim"
(ex: "pode publicar", "aprovado", "manda ver"), mas se a resposta for ambígua ou vier
junto de pedidos de mudança, trate como não-aprovado e ajuste o plano antes de perguntar
de novo. **Nunca interprete silêncio, ou uma pergunta do usuário sobre o plano, como
aprovação.**

## Passo 8: Publicar no Linear

Só chegue aqui depois de aprovação explícita. Leia `references/linear-mcp-actions.md`
para a ordem correta de criação (Document → Project → Epics → Issues → dependências) e
para as regras de segurança dessa etapa.

### Configuração de Team (primeira execução)

Antes de publicar pela primeira vez neste repositório, verifique se existe
`.claude/linear-planning.json` na raiz do projeto:

```json
{
  "linearTeamId": "...",
  "linearTeamName": "..."
}
```

- **Se existir:** use o time salvo diretamente, sem perguntar de novo.
- **Se não existir:** liste os Teams disponíveis via MCP, pergunte ao usuário qual usar
  (mesmo que só exista um, confirme), e então crie o arquivo `.claude/linear-planning.json`
  com o resultado. Da próxima vez este passo é automático.
- Se o usuário quiser publicar num Team diferente do salvo em uma execução específica,
  respeite a escolha pontual dele mas não sobrescreva o arquivo de config sem perguntar
  se isso deve virar o novo padrão.

## Regras gerais (valem para todo o fluxo)

- **O PRD é a fonte da verdade.** Epics e Issues existem para servir o PRD, não o
  contrário — se um durante a quebra você perceber uma necessidade que não está no PRD,
  volte e atualize o PRD primeiro.
- **Uma Issue, uma unidade de trabalho.** Nunca deixe uma Issue com objetivo composto.
- **Toda Issue precisa das 6 seções do template** (Objetivo, Contexto, Critérios de
  aceite, Tarefas, Arquivos relevantes, Blocked by) — mesmo que "Blocked by" seja
  "Nenhuma".
- **Priorize paralelismo real, não aparente.** Dependência só existe quando há um
  artefato concreto faltando, nunca por preferência de ordem.
- **Nunca publique nada no Linear sem aprovação explícita do usuário no Passo 7.** Isso
  vale mesmo que o usuário peça para "ir direto" — nesse caso, ainda assim mostre o
  resumo e peça a confirmação final antes da etapa de publicação; apenas comprima os
  passos 1-6 se o contexto já estiver claro o suficiente.
