# @systembook/cli

O CLI do [SystemBook](https://github.com/mateusvillain/systembook): `systembook`.

```bash
npm i -D @systembook/cli @systembook/schema
npx systembook previews build
```

`@systembook/schema` entra explicitamente porque os seus `*.preview.tsx`
importam `PreviewConfig` dele — com pnpm, uma dependência transitiva não é
resolvível a partir do seu código.

## Comandos

| Comando | O que faz |
|---|---|
| `previews discover` | Lista os `*.preview.tsx` encontrados e os que falharam na validação |
| `previews generate` | Escreve as entradas sintéticas em `.systembook/entries` |
| `previews build` | `generate` + build Vite, produzindo `.systembook/dist/` e `manifest.json` |

Todos aceitam `--root <dir>` (default: o diretório atual). O contrato dos
arquivos `*.preview.tsx` está em
[`docs/preview-tsx-schema.md`](https://github.com/mateusvillain/systembook/blob/main/docs/preview-tsx-schema.md),
e o workflow de CI em
[`docs/ci-example.md`](https://github.com/mateusvillain/systembook/blob/main/docs/ci-example.md).

## Vindo do `@systembook/connector`

O bin `systembook-connector` continua funcionando, com um aviso de
depreciação. Os comandos são os mesmos, agora sob `previews`:
`systembook-connector build` → `systembook previews build`.

## Licença

MIT
