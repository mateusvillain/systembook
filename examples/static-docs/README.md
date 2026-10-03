# Exemplo: modo estático

Um design system fictício (**Acme DS**) documentado no modo estático do
SystemBook: conteúdo em `.mdx` dentro do repositório, site gerado pelo
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
├── systembook.config.ts          # nome, logos, base e status tags
├── brand/                        # logo e logo do tema escuro
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
    │   ├── color/
    │   │   ├── palette.mdx       # página com imagem, tabela e callout
    │   │   ├── img/palette.svg
    │   │   └── tokens/           # página com tabs: index.mdx é o Overview,
    │   │       ├── index.mdx     # os outros arquivos são as tabs
    │   │       ├── usage.mdx
    │   │       └── code.mdx
    │   └── typography/
    │       └── scale.mdx         # headings e marks inline
    └── components/               # menu "Componentes"
        └── actions/
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
| Página com tabs | `foundation/color/tokens/`, `components/actions/button/` |
| Headings 1 a 3, marks, `<u>`, link externo | `foundation/typography/scale.mdx` |
| Listas (aninhadas, número inicial) | `get-started/basics/contributing.mdx`, `components/actions/button/accessibility.mdx` |
| Código com linguagem | `get-started/basics/installation.mdx`, `foundation/color/tokens/code.mdx` |
| Imagem com legenda | `foundation/color/palette.mdx` |
| Tabela | `foundation/color/palette.mdx`, `foundation/color/tokens/usage.mdx` |
| Links entre páginas, tabs e âncoras | `docs/index.mdx`, `get-started/basics/installation.mdx` |
| `<Callout>` (`info`, `warning`, `tip`) | várias páginas |
| `<ComponentEmbed>` | `components/actions/button/index.mdx` |
| `<DosDonts>` (sem cover, cover de componente, cover de imagem) | `foundation/color/tokens/usage.mdx`, `components/actions/button/index.mdx` |
| Aninhamento (`<DosDonts>` dentro de `<Callout>`) | `components/actions/button/accessibility.mdx` |

O formato completo está em [`docs/static-format.md`](../../docs/static-format.md).

## `base`

A config lê `SYSTEMBOOK_BASE` (padrão `/`): o workflow que publica este exemplo
no GitHub Pages builda com `SYSTEMBOOK_BASE=/systembook/`, porque um site de
projeto fica num subpath.
