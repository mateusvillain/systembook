# Publicando previews de componentes via CI (GitHub Actions)

Este guia mostra como o repositório do seu design system publica previews de
componentes na sua instância SystemBook a cada push. O fluxo tem três partes:

1. **Build** — o `systembook-connector` descobre os arquivos `*.preview.tsx`
   do repo, gera um entrypoint por variante e builda tudo com Vite num
   artefato estático em `.systembook/dist/`.
2. **Upload** — para cada variante, o job envia um `tar.gz` autenticado para
   `POST /api/previews` da instância, com `component_name`, `variant_id` e
   `commit_sha`.
3. **Publicação** — a instância extrai o artefato no volume e registra a
   versão; o `component-embed` das páginas de documentação passa a renderizar
   a versão mais recente automaticamente.

> Como escrever os arquivos `*.preview.tsx` (o `PreviewConfig`, o export
> `Preview`) está documentado à parte — veja a documentação do schema de
> previews (TASK-61). O setup geral da instância está na documentação de
> setup (TASK-60).

## Pré-requisitos

### 1. Gere um token de upload

No painel da sua instância, como **admin**, acesse **Tokens**
(`/admin/settings/tokens`), gere um token com um label descritivo (ex.:
"GitHub Actions do design system") e **copie o valor na hora** — ele é
mostrado uma única vez; depois disso só o hash fica armazenado. Se o token
vazar, revogue-o na mesma tela e gere outro.

### 2. Configure secret e variável no repositório

No repositório do design system (GitHub → Settings):

- **Secrets and variables → Actions → New repository secret**:
  - Nome: `SYSTEMBOOK_UPLOAD_TOKEN`
  - Valor: o token copiado no passo anterior.
- **Secrets and variables → Actions → Variables → New repository variable**:
  - Nome: `SYSTEMBOOK_INSTANCE_URL`
  - Valor: a URL pública da sua instância, sem barra final (ex.:
    `https://design.suaempresa.com`).

Nunca coloque o token no YAML ou em qualquer arquivo commitado.

### 3. Nomes compatíveis com upload

`component` e os `id`s de variante dos seus `*.preview.tsx` são usados como
segmentos de caminho na instância e precisam casar com
`[A-Za-z0-9][A-Za-z0-9._-]*` (sem espaços, sem `/`, sem começar com ponto).
`Button`, `data-table`, `primary`, `disabled` são válidos; `Botão legal` não.

## O workflow

Crie `.github/workflows/systembook-preview.yml` no repositório do design
system:

```yaml
name: SystemBook previews

# Push na branch padrão é o gatilho recomendado: cada merge publica a versão
# mais nova dos previews. Ajuste (ex.: tags, workflow_dispatch) se o seu
# fluxo de release for outro.
on:
  push:
    branches: [main]

jobs:
  publish-previews:
    runs-on: ubuntu-latest
    steps:
      # Código do design system (inclui os *.preview.tsx)
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      # Instale as dependências do SEU repo (troque por npm/yarn se for o caso).
      # O @systembook/connector deve estar nas devDependencies.
      - run: pnpm install --frozen-lockfile

      # discover → generate → build: falha o job se qualquer *.preview.tsx
      # for inválido ou não compilar (sem artefato parcial).
      - name: Build dos previews
        run: npx systembook-connector build --root .

      # Um upload por variante: o manifest.json do artefato mapeia cada
      # diretório de variante ao par canônico (component, variantId).
      # O tar de cada variante inclui o diretório assets/ compartilhado —
      # os index.html referenciam ../assets/ por caminho relativo.
      - name: Upload para a instância SystemBook
        env:
          SYSTEMBOOK_UPLOAD_TOKEN: ${{ secrets.SYSTEMBOOK_UPLOAD_TOKEN }}
          SYSTEMBOOK_INSTANCE_URL: ${{ vars.SYSTEMBOOK_INSTANCE_URL }}
        run: |
          cd .systembook/dist
          jq -c '.[]' manifest.json | while read -r entry; do
            component=$(jq -r '.component' <<<"$entry")
            variant=$(jq -r '.variantId' <<<"$entry")
            dir=$(jq -r '.entryDir' <<<"$entry")

            tar -czf /tmp/artifact.tar.gz "$dir" assets

            echo "Publicando $component / $variant…"
            curl --fail-with-body -sS -X POST "$SYSTEMBOOK_INSTANCE_URL/api/previews" \
              -H "Authorization: Bearer $SYSTEMBOOK_UPLOAD_TOKEN" \
              -F component_name="$component" \
              -F variant_id="$variant" \
              -F commit_sha="${{ github.sha }}" \
              -F artifact=@/tmp/artifact.tar.gz
            echo
          done
```

### O que cada parte faz

- **`systembook-connector build --root .`** — varre o repo por
  `*.preview.tsx` (ignorando `node_modules`), valida cada `PreviewConfig`,
  gera os entrypoints em `.systembook/entries/` e builda com Vite para
  `.systembook/dist/`. O diretório `.systembook/` é descartável — adicione-o
  ao `.gitignore` do seu repo. Qualquer preview inválido ou erro de
  compilação encerra o job com código ≠ 0.
- **`manifest.json`** — escrito pelo build na raiz do dist:
  `[{ "component": "Button", "variantId": "primary", "entryDir": "button--primary" }, …]`.
  O loop de upload usa esses valores; não derive component/variant do nome do
  diretório (que é um slug).
- **`tar -czf … "$dir" assets`** — o artefato de cada variante leva o próprio
  diretório e o `assets/` compartilhado do build (os HTML referenciam
  `../assets/…`). O `index.html` da variante fica em
  `<entryDir>/index.html` dentro do artefato.
- **`curl -F …`** — `POST /api/previews` autenticado por
  `Authorization: Bearer` com o token de upload (não é sessão de usuário).
  Respostas: `201` com o registro criado; `401` para token ausente, inválido
  ou revogado; `400` para campos faltando, nomes fora do padrão ou artefato
  corrompido/grande demais (limite padrão: 50 MB por variante).
  `--fail-with-body` garante que o job falhe mostrando o erro retornado.
- **`commit_sha`** — o `github.sha` do push. Re-publicar o mesmo commit
  sobrescreve o mesmo caminho na instância (idempotente); commits novos criam
  versões novas e a documentação passa a servir a mais recente.

### Notas

- Rodando localmente num macOS para testar, use `COPYFILE_DISABLE=1 tar -czf …`
  para o tar não incluir arquivos AppleDouble (`._*`). No `ubuntu-latest` do
  GitHub Actions (GNU tar) isso não acontece.
- Enquanto o pacote `@systembook/connector` não está publicado no npm (fase
  de empacotamento do projeto), dentro deste monorepo o equivalente do build é
  `pnpm --filter @systembook/connector cli build --root <dir>`.
