# @systembook/schema

Contratos de tipo compartilhados do [SystemBook](https://github.com/mateusvillain/systembook).

Pacote **types-only**: não tem runtime próprio. Existe para que o `*.preview.tsx`
que você escreve, o [`@systembook/connector`](https://www.npmjs.com/package/@systembook/connector)
que o builda e o painel admin que o renderiza concordem sobre a mesma forma.

```bash
npm i -D @systembook/schema
```

```ts
import type { PreviewConfig } from '@systembook/schema';

export default {
  component: 'Button',
  variants: [{ id: 'primary', label: 'Primary', props: { variant: 'primary' } }],
  controls: [{ kind: 'boolean', propName: 'disabled' }],
} satisfies PreviewConfig;
```

Exporta `PreviewConfig` (e os tipos de variante e controle que ele compõe),
`BlockType`/`TiptapJson` do modelo de conteúdo, e as mensagens `postMessage`
trocadas entre o painel e o iframe de preview.

Licença MIT.
