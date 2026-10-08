# Exemplo: modo estático

Um design system fictício (**Acme DS**) documentado no modo estático do
Systembook: conteúdo em `.mdx` dentro do repositório, site gerado pelo
`systembook build`. Serve de referência do formato e de fixture do CI do
monorepo, que builda este projeto a cada push.

## Rodar

De dentro do monorepo (o `systembook` vem do workspace, sem build):

```bash
pnpm install
pnpm --filter @systembook/example-static-docs dev     # http://localhost:4000, recarrega ao salvar
pnpm --filter @systembook/example-static-docs check   # valida sem gerar o site
pnpm --filter @systembook/example-static-docs build   # gera systembook-dist/
```

Num projeto seu, o equivalente é `npx systembook dev|check|build` com o
`@systembook/cli` instalado.

## Estrutura

```
static-docs/
├── systembook.config.ts          # nome, logos, base, status tags e tokens
├── brand/                        # logo e logo do tema escuro
├── tokens/                       # design tokens DTCG
│   ├── base.json                 # paleta, espaço, raio, borda, tipografia, elevação, opacidade, z-index e movimento
│   ├── light.json                # cores de papel e da sombra no modo light
│   └── dark.json                 # as mesmas no modo dark
├── src/components/
│   ├── Button.tsx                # o componente do design system
│   └── Button.preview.tsx        # variantes e controles do preview interativo
└── docs/                         # contentDir: a hierarquia vem das pastas
    ├── index.mdx                 # landing
    ├── get-started/              # menu "Começando" (_menu.yml)
    │   └── basics/               # seção "Primeiros passos" (_section.yml)
    │       ├── installation.mdx  # página
    │       └── contributing.mdx
    ├── foundation/               # menu "Fundamentos"
    │   ├── _menu.yml
    │   ├── color/
    │   │   ├── _section.yml
    │   │   ├── palette.mdx       # página com imagem, tabela e callout
    │   │   ├── gradients.mdx     # gradient
    │   │   ├── img/palette.svg
    │   │   └── tokens/           # página com tabs: index.mdx é o Overview,
    │   │       ├── index.mdx     # os outros arquivos são as tabs
    │   │       ├── usage.mdx
    │   │       └── code.mdx
    │   ├── typography/
    │   │   ├── _section.yml
    │   │   ├── scale.mdx         # headings e marks; `slug: type-scale` no frontmatter
    │   │   ├── families.mdx      # fontFamily
    │   │   ├── weights.mdx       # fontWeight
    │   │   └── rhythm.mdx        # line-height (number) e letter-spacing
    │   ├── spacing/scale.mdx     # cada página de fundamentos termina num <TokenTable>
    │   ├── shape/                # border-radius.mdx, border-width.mdx, border-style.mdx (strokeStyle e border)
    │   ├── depth/                # elevation.mdx (sombra por modo), opacity.mdx, z-index.mdx, blur.mdx
    │   ├── layout/               # breakpoints.mdx, aspect-ratio.mdx
    │   ├── icons/                # sizes.mdx
    │   └── motion/               # duration-easing.mdx: curvas, durações e transições
    └── components/               # menu "Componentes"
        ├── _menu.yml
        └── actions/
            ├── _section.yml
            └── button/           # previews do Button.preview.tsx
                ├── index.mdx
                ├── accessibility.mdx
                └── img/dont-stack.svg
```

## Onde cada recurso aparece

| Recurso | Arquivo |
| --- | --- |
| Landing com `title` | `docs/index.mdx` |
| Menus e seções com título e ordem | `_menu.yml`, `_section.yml` |
| Frontmatter (`subtitle`, `order`, `status`) | `get-started/basics/installation.mdx`, `foundation/color/palette.mdx` |
| `slug` no frontmatter | `foundation/typography/scale.mdx` (URL `…/type-scale`) |
| Página com tabs | `foundation/color/tokens/`, `components/actions/button/` |
| Headings 1 a 3, marks, `<u>`, link externo | `foundation/typography/scale.mdx` |
| Listas (aninhadas, número inicial, com blocos dentro) | `get-started/basics/contributing.mdx`, `components/actions/button/accessibility.mdx` |
| Código com e sem linguagem | `get-started/basics/installation.mdx`, `get-started/basics/contributing.mdx`, `foundation/color/tokens/code.mdx` |
| Imagem com legenda | `foundation/color/palette.mdx` |
| Tabela | `foundation/color/palette.mdx`, `foundation/color/tokens/usage.mdx`, `foundation/typography/scale.mdx` |
| Link para página, para âncora de outra página e para âncora da própria | `docs/index.mdx`, `get-started/basics/installation.mdx`, `get-started/basics/contributing.mdx` |
| Link para tab | `foundation/color/palette.mdx` |
| `<Callout>` (`info`, `warning`, `tip`, e sem `variant`) | várias páginas; sem `variant` em `installation.mdx` |
| `<ComponentEmbed>` | `components/actions/button/index.mdx` |
| `<DosDonts>` (sem cover, sem título, cover de componente, cover de imagem) | `foundation/color/tokens/usage.mdx`, `components/actions/button/index.mdx` |
| Aninhamento (`<DosDonts>` dentro de `<Callout>`) | `components/actions/button/accessibility.mdx` |
| `<TokenTable>` (um formato por tipo; colunas por modo só quando o valor muda) | `foundation/color/palette.mdx`, `foundation/typography/`, `foundation/spacing/`, `foundation/shape/`, `foundation/depth/`, `foundation/motion/` |

O formato completo está em [`docs/static-format.md`](../../docs/static-format.md).

## `base`

A config não fixa `base` (padrão `/`, como no `systembook dev`). Este exemplo é
publicado no GitHub Pages do repositório, num subpath (`/systembook/`): o
workflow (`.github/workflows/pages.yml`) passa o subpath no build, com
`systembook build --base`. O passo a passo para outros hosts está em
[`docs/deploy-static.md`](../../docs/deploy-static.md).

## Design tokens

Os tokens do Acme DS seguem o formato DTCG e entram pelo campo `tokens` da
config: `base.json` vale para todos os modos, e `light.json`/`dark.json`
definem as cores de papel (`acme.primary`, `acme.surface`…) de cada modo,
apontando para a paleta. O `check` valida tudo e o resumo conta os tokens; o
`build` grava os valores resolvidos de cada modo em
`systembook-dist/_systembook/data/tokens.json`. O formato completo está em
[`docs/tokens.md`](../../docs/tokens.md).
