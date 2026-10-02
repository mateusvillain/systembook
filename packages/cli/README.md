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
| `build` | Gera o site estático do modo estático em `outDir` (ver abaixo) |
| `previews discover` | Lista os `*.preview.tsx` encontrados e os que falharam na validação |
| `previews generate` | Escreve as entradas sintéticas em `.systembook/entries` |
| `previews build` | `generate` + build Vite, produzindo `.systembook/dist/` e `manifest.json` |

Todos aceitam `--root <dir>` (default: o diretório atual). O contrato dos
arquivos `*.preview.tsx` está em
[`docs/preview-tsx-schema.md`](https://github.com/mateusvillain/systembook/blob/main/docs/preview-tsx-schema.md),
e o workflow de CI em
[`docs/ci-example.md`](https://github.com/mateusvillain/systembook/blob/main/docs/ci-example.md).

## Modo estático: `systembook build`

Lê o `systembook.config.{ts,js,mjs,json}` da raiz (ou de `--root <dir>`) e
gera em `outDir` (padrão `systembook-dist/`) um site que funciona em qualquer
host estático — GitHub Pages, Vercel, Netlify, S3 — na raiz ou em subpath
(`base`), com deep links e refresh sem regra de rewrite:

```
systembook-dist/
├── index.html                       # landing
├── foundation/color/palette/index.html
├── foundation/color/tokens/usage/index.html   # uma por página e por tab
├── 404.html
├── .nojekyll                        # o GitHub Pages ignora pastas com _ sem ele
└── _systembook/
    ├── assets/                      # bundle da doc
    └── data/                        # nav, settings e uma página por JSON
```

Cada `index.html` traz o `<title>` e a meta description da página (o
subtítulo, ou o primeiro parágrafo). Erros de conteúdo saem todos de uma vez,
com `arquivo:linha:coluna`, e o comando termina com código ≠ 0 sem gerar nada.
O formato do conteúdo e da config está em
[`docs/static-format.md`](https://github.com/mateusvillain/systembook/blob/main/docs/static-format.md).

O `outDir` é apagado a cada build; por isso ele não pode ser a raiz do
projeto nem conter (ou ficar dentro de) a pasta de conteúdo.

## Vindo do `@systembook/connector`

O bin `systembook-connector` continua funcionando, com um aviso de
depreciação. Os comandos são os mesmos, agora sob `previews`:
`systembook-connector build` → `systembook previews build`.

## Licença

MIT
