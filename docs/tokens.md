# Design tokens

O Systembook documenta os design tokens que já existem no repositório do design
system: ele lê os arquivos, resolve aliases e modos e mostra os valores na
doc. Os tokens não são editados no painel — o repositório é a fonte da verdade.

Este documento é a referência do formato que o parser
(`@systembook/content/tokens`) aceita. Se os dois divergirem, o parser e os
testes dele valem, e este documento precisa ser corrigido.

> A configuração que aponta os arquivos (o campo `tokens` do
> `systembook.config` e o comando de publicação no modo CMS) ainda está em
> desenvolvimento e entra aqui quando chegar.

## Formato: DTCG

Os arquivos seguem o formato do [Design Tokens Community
Group](https://www.designtokens.org/) (W3C): JSON com grupos aninhados, e cada
token é um objeto com `$value`.

```json
{
  "color": {
    "$type": "color",
    "blue": {
      "500": { "$value": "#0a84ff", "$description": "Azul da marca" }
    },
    "action": { "$value": "{color.blue.500}" }
  },
  "space": {
    "sm": { "$value": "4px", "$type": "dimension" }
  }
}
```

- **Caminho:** os grupos viram o caminho do token com pontos —
  `color.blue.500`. Nomes não podem ser vazios nem ter `.`, `{` ou `}`.
- **`$type`:** o do token, senão o do grupo mais próximo, senão o do token
  apontado pelo alias. Grupos de mesmo caminho em arquivos diferentes são um
  grupo só: um `$type` declarado num arquivo vale para os tokens do grupo nos
  outros.
- **`$description`** e **`$deprecated`** (`true` ou o texto do que usar no
  lugar) aparecem na doc. `$deprecated` de um grupo vale para os tokens dele.
- **`$extensions`** é aceito e ignorado. `$root` (o token do próprio grupo, da
  spec 2025.10) vira o caminho `grupo.$root`.
- Os tipos são os da spec: `color`, `dimension`, `fontFamily`, `fontWeight`,
  `duration`, `cubicBezier`, `number`, `strokeStyle`, `border`, `transition`,
  `shadow`, `gradient` e `typography`. Valores em texto (`"#0a84ff"`,
  `"16px"`) e na forma de objeto da spec 2025.10 são aceitos.

### Vários arquivos

Os tokens podem estar espalhados em quantos arquivos quiser; eles são lidos na
ordem dada e mesclados num conjunto só. Se o mesmo token aparece em dois
arquivos, vale o último, com um aviso.

## Aliases

Um alias é um texto `{caminho.do.token}`, no valor inteiro ou num campo de um
valor composto:

```json
{
  "shadow": {
    "card": {
      "$type": "shadow",
      "$value": { "color": "{color.black}", "offsetX": "0px", "offsetY": "2px", "blur": "8px", "spread": "0px" }
    }
  }
}
```

A doc mostra o valor final e, quando o valor inteiro é um alias, para qual
token ele aponta. Texto com o alias no meio (`"calc({space.sm} * 2)"`) não é
alias.

## Modos

Modos (claro/escuro, marcas) vêm de **arquivos por modo**: cada arquivo é
marcado com o modo que define e sobrepõe os arquivos base, que valem para
todos os modos.

```
tokens/
  base.json      → base: todos os modos
  light.json     → modo light
  dark.json      → modo dark
```

- Um token que só está no `base.json` tem o mesmo valor em todos os modos.
- Um token no `dark.json` substitui o do base no modo `dark`.
- Também funciona sem base, com um arquivo completo por modo — é o que o export
  de variáveis do Figma gera.
- Sem nenhum arquivo de modo, o conjunto tem um modo só, `default`.

O alias é resolvido **dentro do modo**: se `color.text` vale
`{color.fg}`, no modo `dark` ele vale o `color.fg` do `dark`.

Todo token precisa ter valor em todos os modos — vindo do base ou do arquivo
do modo. `$type`, `$description` e `$deprecated` são do token, não do modo.

Essa convenção é do Systembook. A spec DTCG não define modos dentro do formato
de token; o módulo Resolver da spec compõe conjuntos de arquivos, e é a mesma
ideia.

## Erros

Todo erro traz o arquivo e o caminho do token, e o build lista **todos** de
uma vez. Um token com erro fica de fora da doc, e quem aponta para ele também.

```
tokens/color.json  color.brand: o alias {color.bleu} aponta para um token que não existe (quis dizer "color.blue"?).
tokens/color.json  color.action: o alias {color.brand} aponta para um token com erro.
tokens/dark.json   color.bg: "$type" diferente entre os arquivos: color, dimension.
tokens/light.json  color.fg: sem valor no modo dark — defina o token num arquivo base ou em todos os modos.
```

São erros: JSON inválido; nome inválido; valor solto sem `$value`; caminho que é
token num arquivo e grupo em outro; `$type` diferente entre arquivos; token
sem valor em algum modo; alias para um token que não existe ou para um grupo;
referência circular (`a → b → a`); `$type` diferente do token apontado; token
sem `$type` ou com um `$type` que não é da spec; valor fora do formato do tipo,
em qualquer modo; campo de valor composto apontando para um token de outro
tipo (`"color": "{space.sm}"`).

São só avisos: propriedade desconhecida (como `$extends`, ainda não suportado),
token redefinido, `$type` de grupo diferente entre arquivos e, nos tipos
compostos, campo faltando ou que não faz parte do tipo.

### Formato dos valores

O valor é conferido depois de resolver os aliases, em cada modo:

| Tipo | Aceita |
| --- | --- |
| `color` | `"#0a84ff"` (3, 4, 6 ou 8 dígitos), `"rgb(…)"`/`"oklch(…)"`, nome CSS, ou `{ colorSpace, components, alpha?, hex? }` |
| `dimension` | `"16px"`, `"-0.5rem"`, `"0"`, ou `{ value, unit }` |
| `fontFamily` | texto ou lista de textos |
| `fontWeight` | 1 a 1000, ou um nome (`"bold"`, `"semi-bold"`…) |
| `duration` | `"200ms"`, `"0.2s"`, ou `{ value, unit: "ms" \| "s" }` |
| `cubicBezier` | `[x1, y1, x2, y2]`, com `x1` e `x2` entre 0 e 1 |
| `number` | número |
| `strokeStyle` | `"solid"`, `"dashed"`… ou `{ dashArray, lineCap }` |
| `border` | `{ color, width, style }` |
| `transition` | `{ duration, delay, timingFunction }` |
| `shadow` | `{ color, offsetX, offsetY, blur, spread, inset? }`, ou uma lista delas |
| `gradient` | lista de `{ color, position }` |
| `typography` | `{ fontFamily, fontSize, fontWeight, letterSpacing, lineHeight }` — `lineHeight` em número ou dimensão |
