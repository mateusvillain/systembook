# Template de PRD

Use exatamente esta estrutura de seções, nesta ordem, ao gerar o documento de PRD. Cada seção deve ter conteúdo real e específico — nunca deixe uma seção com placeholder genérico tipo "TBD".

```markdown
# [Nome da Feature]

# Objetivo
O que essa feature busca alcançar e por quê agora. 1-3 frases diretas, sem enrolação.

# Problema
Qual dor, hipótese ou oportunidade motiva isso. Sempre que possível, ancore em evidência
(feedback de usuário, dado, incidente, pedido recorrente) em vez de opinião.

# Solução
Descrição da abordagem escolhida em nível de produto — não é spec técnica, é o "o quê"
e o "como" em alto nível. Se houver alternativas descartadas, vale citar em 1 linha por quê.

# Usuários
Quem é afetado (persona, papel, segmento). Se houver mais de um público, liste os
principais e o que cada um ganha.

# Fluxo principal
O caminho feliz descrito passo a passo, do ponto de vista do usuário. Use lista numerada.
Fluxos alternativos/erros relevantes podem entrar aqui como sub-itens, mas o foco é o
caminho principal.

# Critérios de aceite
Lista verificável de "pronto quando". Cada item deve ser binário (sim/não), não vago.

# Fora do escopo
O que deliberadamente NÃO está incluído nesta iteração. Isso existe para prevenir scope
creep e para as Epics/Issues saberem onde parar.

# Dependências
Dependências externas ao PRD: outros times, serviços, decisões pendentes, ou pré-requisitos
técnicos que não são "issues" desse plano mas que o bloqueiam ou influenciam.

# Métricas de sucesso
Como saberemos que funcionou. Prefira métricas mensuráveis; se for qualitativo, diga
explicitamente como será avaliado (ex: "aprovação do time de X em review").
```

## Como preencher a partir da conversa com o usuário

- **Objetivo/Problema/Solução** geralmente vêm direto da ideia inicial do usuário — só
  organize e clarifique, sem inventar motivação que ele não deu.
- **Usuários**, **Critérios de aceite** e **Fora do escopo** são as seções que mais
  precisam de perguntas ativas — usuários costumam pular direto pra solução sem definir
  isso, e é exatamente aí que fica ambíguo depois.
- **Métricas de sucesso**: se o usuário não tiver uma métrica clara, sugira 1-2 opções
  razoáveis baseadas no tipo de feature em vez de deixar em branco.
- Nunca invente números, prazos ou nomes de pessoas/times que o usuário não mencionou.
