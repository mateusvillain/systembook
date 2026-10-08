# Design tokens

O Systembook documenta os design tokens que já existem no repositório do design
system: ele lê os arquivos, resolve aliases e modos e mostra os valores na
doc. Os tokens não são editados no painel — o repositório é a fonte da verdade.

Este documento é a referência do formato que o parser
(`@systembook/content/tokens`) aceita. Se os dois divergirem, o parser e os
testes dele valem, e este documento precisa ser corrigido.

No modo estático os tokens vão no build; no modo CMS, o CI os publica na
instância com `systembook tokens` (ver [Publicar no CMS](#publicar-no-cms)).

## Configuração

No modo estático, o campo `tokens` do `systembook.config` aponta os arquivos,
relativos à raiz do projeto. Aceita um arquivo, um glob ou uma lista:

```ts
export default {
  name: 'Acme Design System',
  tokens: 'tokens/**/*.json',
} satisfies SystemBookConfig;
```

Com modos, `files` são os arquivos base e `modes` os de cada modo, na ordem em
que a doc os mostra:

```ts
tokens: {
  files: 'tokens/base/*.json',
  modes: {
    light: 'tokens/light.json',
    dark: 'tokens/dark.json',
  },
},
```

O projeto de exemplo [`examples/static-docs`](../examples/static-docs) usa
essa forma: paleta e escalas num `base.json`, cores de papel em `light.json` e
`dark.json`.

`files` é opcional (um arquivo completo por modo, como o export do Figma, não
precisa de base). Os modos seguem a ordem em que aparecem na config — exceto os
de nome só numérico (`"1"`), que o JavaScript põe antes dos outros num objeto.

- Cada padrão precisa casar com algum arquivo dentro do projeto (um link
  simbólico para fora não é lido), e um arquivo é base ou de um modo, nunca os
  dois.
- `!padrão` exclui arquivos dos outros padrões do mesmo grupo
  (`["tokens/*.json", "!tokens/draft.json"]`).
- `node_modules`, `.git`, a pasta do site gerado (`outDir`) e o próprio
  arquivo de config ficam de fora dos globs.

`systembook build` e `systembook check` falham com qualquer erro nos tokens
(saída com código 1) e listam os avisos sem falhar — com só avisos, o `check`
sai com 0 e o resumo diz quantos tokens leu (e os modos, quando há mais de um). O `systembook dev` mostra
erros e avisos ao salvar um arquivo de tokens.

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

## Na doc

Com tokens, a doc ganha uma página **Tokens** (`/tokens`, ou `/docs/tokens` no
CMS) com todos eles, e um link para ela no header. As seções seguem os grupos
logo abaixo do prefixo que todo token compartilha: com `acme.palette.*`,
`acme.space.*` e `acme.primary`, as seções são `acme.palette`, `acme.space` e
`acme` (os tokens que moram direto no prefixo). Sem tokens, a página e o link
não existem.

Para mostrar um grupo dentro de uma página, use o bloco
[`<TokenTable>`](./static-format.md#tokentable) (no CMS, "Token table" no menu
de blocos). Nos dois casos, cada tipo usa o formato próprio — swatch de cor,
specimen de tipografia (a frase com o estilo inteiro e as propriedades
rotuladas), barra de dimensão, cartão com a sombra, gráfico da curva de
easing e barra de duração (com um botão ▶ que anda um ponto no tempo e na
curva do token; nada anima sozinho, e some com `prefers-reduced-motion`) — e o
resto aparece numa tabela de valores. As colunas por modo (`light`, `dark`) só aparecem quando
algum valor muda entre eles; senão, uma coluna "Value".

### No preview dos componentes

O iframe de cada preview recebe os tokens como variáveis CSS, com os nomes da
coluna "Variável CSS" ([Nomes para copiar](#nomes-para-copiar)). O componente
reage aos modos lendo as variáveis:

```tsx
<button style={{ background: 'var(--acme-primary, #4f46e5)' }} />
```

O primeiro modo vale de saída; com mais de um, a barra do preview ganha um
seletor (`light` / `dark`) que troca o modo só daquele preview. Por baixo, cada
modo é um bloco `[data-mode="<modo>"]` e o seletor muda o `data-mode` do
`<html>` do iframe. A tipografia ganha, além do `font`, uma variável por campo
(`--acme-font-body-letter-spacing`), porque o `font` não carrega o
`letter-spacing`. O segundo valor do `var()` é o que vale fora da doc, sem os
tokens injetados. O contrato da mensagem está em
[`docs/preview-tsx-schema.md`](./preview-tsx-schema.md#design-tokens-systembookset-tokens).

## Publicar no CMS

No modo CMS os arquivos continuam no repositório do design system, e o CI
publica na instância a cada mudança:

```bash
npx systembook tokens --to https://docs.acme.dev
```

O comando lê a `tokens` da config (a mesma do modo estático), valida como o
`systembook check` e envia os arquivos para `POST /api/tokens`. A instância
valida de novo e publica; a doc passa a mostrar a versão nova sem editar
página nenhuma. Com qualquer erro, local ou da instância, nada é publicado e
os erros saem todos de uma vez. Cada publicação substitui a anterior inteira:
um token apagado do arquivo some da doc.

| Opção | O que é |
| --- | --- |
| `--to <url>` | URL da instância (obrigatória). |
| `--token <token>` | Token de escopo **Design tokens upload (CI)**, gerado em **Upload tokens** (menu do usuário, só admin). Sem a opção, vem de `SYSTEMBOOK_TOKEN`. |
| `--root <dir>` | Raiz do projeto, onde está a config. Padrão: a pasta atual. |
| `--commit <sha>` | Commit dos arquivos, registrado com a publicação. Padrão: `GITHUB_SHA`, ou o `HEAD` do git. |

No GitHub Actions, com o token num secret:

```yaml
- run: npx systembook tokens --to ${{ vars.SYSTEMBOOK_INSTANCE_URL }}
  env:
    SYSTEMBOOK_TOKEN: ${{ secrets.SYSTEMBOOK_TOKENS_TOKEN }}
```

Use um token só para isto, separado do de previews: revogar um não derruba o
outro.

## Nomes para copiar

A doc mostra, para cada token, o caminho e dois nomes prontos para copiar:

| | Regra | `color.brandPrimary.500` |
| --- | --- | --- |
| Variável CSS | segmentos em kebab-case, minúsculos, unidos por `-` (a convenção do Style Dictionary) | `--color-brand-primary-500` |
| JS | acesso num objeto aninhado com os mesmos grupos | `color.brandPrimary[500]` |

Na variável CSS, cada segmento do caminho:

- quebra o camelCase em hífen (`brandPrimary` → `brand-primary`,
  `HTMLBody` → `html-body`, também com acento: `brandÉclair` → `brand-éclair`);
- vai para minúsculas;
- troca pontuação ASCII (espaço, `:`, `;`, `(`, `/`, aspas…) por `-`, sem
  hífens repetidos nem nas pontas; letras acentuadas, outros alfabetos e emoji
  ficam como estão — são válidos num nome CSS;
- se for só pontuação (`@@`), vira os códigos dos caracteres (`40-40`), para
  não sumir;
- `$root` some: `accent.$root` → `--accent`.

No JS, segmento que é identificador vira `.nome`; inteiro sem zero à esquerda
(até 15 dígitos) vira `[500]`; o resto vai entre aspas (`["2xl"]`, `["05"]`).
Se o primeiro segmento não pode abrir uma expressão (`2xl`, ou uma palavra
reservada como `default`), ela parte de `tokens`: `tokens["2xl"].gap`.

O preview dos componentes usa a mesma variável CSS. Se dois tokens geram a
mesma variável (`color.brandPrimary` e `color.brand-primary`), o build avisa:
no preview, um sobrescreveria o outro.

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
tipo (`"color": "{space.sm}"`); valor composto sem nenhum campo do tipo.

São só avisos: propriedade desconhecida (como `$extends`, ainda não suportado),
token redefinido, `$type` de grupo diferente entre arquivos, grupo que declara
`$type` mas não tem nenhum token (quase sempre um `$value` esquecido), dois
tokens com a mesma variável CSS e, nos tipos
compostos, campo faltando ou que não faz parte do tipo.

### Formato dos valores

O valor é conferido depois de resolver os aliases, em cada modo. Um token com
vários problemas lista todos de uma vez; o erro que só acontece num modo aponta
o arquivo daquele modo.

| Tipo | Aceita |
| --- | --- |
| `color` | `"#0a84ff"` (3, 4, 6 ou 8 dígitos), funções de cor CSS (`rgb()`, `hsl()`, `oklch()`, `color()`…), nome de cor CSS (`rebeccapurple`, `transparent`), ou `{ colorSpace, components, alpha?, hex? }` |
| `dimension` | `"16px"`, `"-0.5rem"`, `"1.5em"`, `"100%"` (unidades de comprimento CSS), número puro (px), ou `{ value, unit }` |
| `fontFamily` | texto ou lista de textos |
| `fontWeight` | 1 a 1000 (número ou texto), ou um nome em qualquer grafia (`"bold"`, `"semi-bold"`, `"SemiBold"`, `"Semi Bold"`) |
| `duration` | `"200ms"`, `"0.2s"`, número puro (ms), ou `{ value, unit: "ms" \| "s" }` |
| `cubicBezier` | `[x1, y1, x2, y2]`, com `x1` e `x2` entre 0 e 1, ou `"linear"`, `"ease"`, `"ease-in"`, `"ease-out"`, `"ease-in-out"` |
| `number` | número |
| `strokeStyle` | `"solid"`, `"dashed"`… (sem diferença de caixa) ou `{ dashArray, lineCap }` |
| `border` | `{ color, width, style }` |
| `transition` | `{ duration, delay, timingFunction }` |
| `shadow` | `{ color, offsetX, offsetY, blur, spread, inset? }`, ou uma lista delas |
| `gradient` | lista de `{ color, position }`, com `position` de 0 a 1 ou em `"%"` |
| `typography` | `{ fontFamily, fontSize, fontWeight, letterSpacing, lineHeight }` — `lineHeight` em número ou dimensão |
