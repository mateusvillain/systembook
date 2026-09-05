# @systembook/connector

CLI que conecta o repositório do seu design system ao
[SystemBook](https://github.com/mateusvillain/systembook).

Varre o repo por arquivos `*.preview.tsx`, gera as entradas de preview e builda
um artefato estático que o CI envia para a sua instância — o SystemBook não
compila o código de vocês, só hospeda o resultado.

```bash
npm i -D @systembook/connector @systembook/schema
npx systembook-connector build
```

`@systembook/schema` entra explicitamente porque os seus `*.preview.tsx`
importam `PreviewConfig` dele — com pnpm, uma dependência transitiva não é
resolvível a partir do seu código.

## Comandos

| Comando | O que faz |
|---|---|
| `discover` | Lista os `*.preview.tsx` encontrados e os que falharam na validação |
| `generate` | Escreve as entradas sintéticas em `.systembook/entries` |
| `build` | `generate` + build Vite, produzindo `.systembook/dist/` e `manifest.json` |

Todos aceitam `--root <dir>` (default: o diretório atual).

## O arquivo de preview

Cada arquivo exporta **duas** coisas: um componente `Preview`, que monta o
componente real com as props recebidas, e um default export com os metadados.

```tsx
// src/components/button.preview.tsx
import type { PreviewConfig } from '@systembook/schema';
import { Button } from './button';

export function Preview(props: Record<string, unknown>) {
  return <Button {...props} />;
}

export default {
  component: 'Button',
  variants: [
    { id: 'primary', label: 'Primary', props: { variant: 'primary', children: 'Salvar' } },
    { id: 'disabled', label: 'Disabled', props: { variant: 'primary', disabled: true } },
  ],
  controls: [
    { kind: 'text', propName: 'children', label: 'Texto' },
    { kind: 'boolean', propName: 'disabled' },
    { kind: 'select', propName: 'variant', options: ['primary', 'ghost'] },
  ],
} satisfies PreviewConfig;
```

`react` e `react-dom` precisam resolver a partir da raiz do repo alvo: o preview
é buildado com o React de vocês, não com uma cópia do connector.

Fluxo completo de CI em
[`docs/ci-example.md`](https://github.com/mateusvillain/systembook/blob/main/docs/ci-example.md).

Licença MIT.
