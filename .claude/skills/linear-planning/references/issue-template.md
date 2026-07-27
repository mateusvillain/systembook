# Template de Issue (Sub-Issue)

Uma Issue é a menor unidade de trabalho executável — deve poder ser pega por uma pessoa
e concluída sem precisar renegociar o escopo no meio do caminho.

```markdown
# [Nome da Issue]

# Objetivo
O que essa issue especificamente entrega, em 1 frase. Se você precisa de "e" para
descrever o objetivo (ex: "criar o formulário E integrar com a API"), provavelmente é
mais de uma issue.

# Contexto
Por que essa issue existe e como ela se encaixa na Epic/PRD. Uma pessoa que nunca viu o
PRD deveria conseguir entender o suficiente para começar a trabalhar.

# Critérios de aceite
Lista verificável, binária, do que precisa ser verdade para a issue ser considerada pronta.
Herda do PRD/Epic o que for aplicável, mas específico para o recorte desta issue.

# Tarefas
Checklist de passos concretos de execução (não é obrigatório ser exaustivo, mas deve dar
um ponto de partida claro). Use `- [ ]`.

# Arquivos relevantes
Caminhos de arquivos, módulos ou áreas do código prováveis de serem tocados, quando
identificáveis pelo contexto. Se não for possível saber, escreva "A definir na execução".

# Blocked by
Lista de outras Issues (por título ou identificador, uma vez criadas) que precisam estar
prontas antes desta poder começar. Se não houver, escreva "Nenhuma".
```

## Regras para quebrar uma Epic em Issues

1. **Uma issue, uma unidade de trabalho.** Se ao escrever o Objetivo você usa "e"/"depois"
   para encadear duas coisas, quebre em duas issues.
2. **Otimize para paralelismo, não para ordem de execução "óbvia".** O instinto natural é
   sequenciar tudo (design → API → integração → testes). Antes de aceitar isso, pergunte:
   essas partes têm de fato uma dependência de dado/contrato, ou é só hábito de trabalhar
   em ordem? Um contrato de API acordado antecipadamente (ex: schema definido na própria
   Epic ou em uma issue curta de "definir contrato") costuma liberar frontend e backend
   para rodar em paralelo em vez de em série.
3. **`Blocked by` só para dependência real e direta.** Não marque uma issue como blocked
   by outra só porque "faz mais sentido" fazer depois — isso mata paralelismo
   artificialmente. A dependência tem que ser: a issue B literalmente não pode começar (ou
   não pode ser testada) sem um artefato concreto que só existe depois que A termina
   (schema, endpoint, componente, decisão).
4. **Tamanho:** cada issue deve ser algo que uma pessoa consegue concluir em um período
   curto e contido (pense em "poucos dias", não "semanas"). Se está maior que isso, quebre.
5. **Issues sem dependências vêm primeiro na lista e devem ser destacadas no resumo** —
   são o que permite começar a trabalhar imediatamente enquanto o resto é discutido.
