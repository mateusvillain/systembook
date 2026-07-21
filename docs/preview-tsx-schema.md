# Contrato do `*.preview.tsx`

Este documento é a referência do arquivo `*.preview.tsx` — o arquivo que o **time
consumidor** escreve no próprio repositório para expor um componente ao live
preview do SystemBook. O `@systembook/connector` descobre esses arquivos, builda
cada variante no CI do time e envia o artefato estático para a instância; o
`component-embed` da doc então renderiza esse artefato num iframe real e
interativo.

O tipo canônico é `PreviewConfig`, exportado de
[`@systembook/schema`](../packages/schema/src/preview-config.ts). Este documento é
escrito à mão — se ele divergir do tipo exportado, **o tipo é a fonte da verdade**.

## Anatomia do arquivo

Um `*.preview.tsx` exporta **duas** coisas:

1. Um **export nomeado `Preview`** — um componente React que recebe `props:
   Record<string, unknown>` e renderiza o componente real do design system com
   essas props. É o que o harness monta dentro do iframe.
2. Um **default export** que satisfaz `PreviewConfig` — os metadados (nome do
   componente, variantes e controles).

```tsx
import { Button } from './button';
import type { PreviewConfig } from '@systembook/schema';

// (1) O componente que o harness monta. Ele mapeia props genéricas para o
//     componente real — é o único lugar que conhece a API do componente.
export function Preview(props: Record<string, unknown>) {
  return <Button {...props} />;
}

// (2) Os metadados do preview.
export default {
  component: 'Button',
  variants: [/* ... */],
  controls: [/* ... */],
} satisfies PreviewConfig;
```

## Referência de tipos

### `PreviewConfig`

O default export do arquivo.

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `component` | `string` | sim | Nome de exibição do componente. É a **chave** usada pelo `component-embed` para referenciar este preview na doc. Deve ser estável entre builds. |
| `variants` | `PreviewVariant[]` | sim | Uma ou mais variantes nomeadas do componente. Cada variante vira um artefato buildado e enviado separadamente. |
| `controls` | `PreviewControl[]` | sim | Controles interativos exibidos ao lado do preview. Pode ser um array vazio (`[]`) se o componente não tiver props ajustáveis. |

### `PreviewVariant`

Uma configuração nomeada do componente (ex.: "Primary", "Disabled").

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | `string` | sim | Identificador **estável** da variante, referenciado por `component-embed.variantId`. Não renomeie depois de publicado — quebraria os embeds existentes. |
| `label` | `string` | sim | Nome exibido no seletor de variantes. |
| `props` | `Record<string, unknown>` | sim | Valores **iniciais** de props passados ao componente quando a variante é montada. Os controles interativos podem sobrescrever esses valores em runtime. |

### `PreviewControl`

Um controle interativo — uma **união discriminada** pelo campo `kind`. O MVP
suporta três tipos: `text`, `boolean` e `select`. Todos compartilham:

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `kind` | `'text' \| 'boolean' \| 'select'` | sim | Discrimina o tipo do controle. |
| `propName` | `string` | sim | Nome da prop do componente que este controle muta em runtime. |
| `label` | `string` | não | Rótulo exibido no painel de controles. Default: o próprio `propName`. |

Campos específicos por `kind`:

| `kind` | Campo extra | Tipo | Descrição |
| --- | --- | --- | --- |
| `text` | `defaultValue?` | `string` | Valor inicial do campo de texto livre. |
| `boolean` | `defaultValue?` | `boolean` | Estado inicial do toggle. |
| `select` | `options` | `string[]` | **Obrigatório** — o conjunto fixo de valores selecionáveis. |
| `select` | `defaultValue?` | `string` | Valor inicial selecionado (deve estar em `options`). |

> Nota: `defaultValue` é o valor inicial do **controle**. Se ele conflitar com o
> valor da mesma prop em `variants[].props`, o valor do controle prevalece assim
> que o usuário interage. Mantenha-os coerentes para evitar um "salto" visual.

## Exemplo completo — `button.preview.tsx`

Um exemplo realista com duas variantes e um controle de cada tipo suportado:

```tsx
import { Button } from './button';
import type { PreviewConfig } from '@systembook/schema';

export function Preview(props: Record<string, unknown>) {
  return <Button {...props} />;
}

export default {
  component: 'Button',
  variants: [
    {
      id: 'default',
      label: 'Default',
      props: { variant: 'default', size: 'md', children: 'Salvar' },
    },
    {
      id: 'destructive',
      label: 'Destructive',
      props: { variant: 'destructive', size: 'md', children: 'Excluir' },
    },
  ],
  controls: [
    { kind: 'text', propName: 'children', label: 'Texto' },
    { kind: 'boolean', propName: 'disabled', defaultValue: false },
    {
      kind: 'select',
      propName: 'size',
      label: 'Tamanho',
      options: ['sm', 'md', 'lg'],
      defaultValue: 'md',
    },
  ],
} satisfies PreviewConfig;
```

Neste exemplo:
- **`children` (text)** e **`size` (select)** aparecem nas props das variantes
  **e** como controles — o usuário parte do valor da variante e ajusta ao vivo.
- **`disabled` (boolean)** não está nas props das variantes; parte do
  `defaultValue: false` do controle.

## Convenção de descoberta e nomeação

O connector (`@systembook/connector discover`, TASK-39) usa estas regras:

- **Padrão de arquivo**: qualquer arquivo cujo nome termine em **`.preview.tsx`**,
  em qualquer profundidade dentro da raiz passada (`--root`). O prefixo é livre —
  a convenção é nomear pelo componente (`button.preview.tsx`).
- **`node_modules` é ignorado** — arquivos `*.preview.tsx` dentro de dependências
  não são descobertos.
- **Componente real**: o connector **não** procura o componente por convenção de
  caminho. Ele importa o `*.preview.tsx`, e é o arquivo de preview que importa o
  componente real (`import { Button } from './button'`). Por isso a única
  referência ao componente vive dentro do `Preview` — normalmente um import
  relativo ao lado do arquivo de preview. O bundle do build resolve esse import e
  empacota tudo junto.

Cada **variante** é buildada como um HTML/JS estático independente (um diretório
`{component}--{variantId}/` no artefato) e enviada individualmente ao endpoint de
upload da instância, chaveada por `(component, variantId, commitSha)`. O
`component-embed` da doc pede o artefato mais recente para o par
`(component, variantId)` e o renderiza.

Para o passo a passo do pipeline de CI (build + upload por variante), veja
[`docs/ci-example.md`](./ci-example.md); para o onboarding completo (subir a
instância, instalar o conector, primeiro login), veja o
[guia de setup](./setup.md).

## Contrato `postMessage` (`systembook:update-props`)

Isto interessa a quem quiser **entender ou estender** o comportamento de runtime —
por exemplo, construir uma UI de controles customizada em vez do painel padrão do
admin. Se você só escreve arquivos `*.preview.tsx`, não precisa disso.

Cada variante é montada dentro do iframe pelo `preview-kit` (`mount()`, TASK-38),
que fica escutando mensagens `postMessage` da página que embeda o iframe. O painel
de controles do admin (TASK-49) envia:

```ts
{
  type: 'systembook:update-props',
  props: { /* props parciais a mesclar */ }
}
```

- **`type`** é sempre a string literal `'systembook:update-props'`. O
  `preview-kit` exporta esse literal como `UPDATE_PROPS_MESSAGE_TYPE`, e o tipo da
  mensagem (`PreviewUpdatePropsMessage` / `PreviewMessage`) vem de
  [`@systembook/schema`](../packages/schema/src/preview-messages.ts).
- **`props`** é um objeto **parcial** — o `preview-kit` faz o **merge** dessas
  props sobre as props atuais do componente e re-renderiza. Só as props presentes
  na mensagem mudam; as demais são preservadas.

### Segurança de origin

O `mount()` só aceita mensagens da origin esperada. A origin permitida é resolvida
nesta ordem:

1. A opção `allowedOrigin` passada explicitamente ao `mount()`.
2. Senão, a origin de `document.referrer` (a página que embeda o iframe).
3. Senão, a própria origin da janela.

Mensagens de qualquer outra origin são **ignoradas com um `console.warn`**;
mensagens com shape inesperado são ignoradas em silêncio. Uma UI de controles
customizada precisa rodar na mesma origin que embeda o iframe (ou passar
`allowedOrigin` explicitamente ao montar) para que as mensagens sejam aceitas.
