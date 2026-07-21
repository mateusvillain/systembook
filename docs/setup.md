# Setup — do zero a uma instância conectada

Este guia leva um time do nada até uma instância do SystemBook rodando, com o
repositório do design system publicando previews de componentes nela via CI. Siga
as seções na ordem.

> **Uma instância = um design system.** O SystemBook **não é multi-tenant**: cada
> instância documenta um único design system. Para documentar outro design system,
> suba outra instância (outro container, outro volume). Não há passos de
> configuração de "tenant" ou "workspace" — se você procurava por isso, ele não
> existe por decisão de escopo.

Pré-requisitos:

- **Docker** + **Docker Compose** na máquina/servidor que vai hospedar a instância.
- Um repositório de componentes (o design system) com **CI** — os exemplos usam
  **GitHub Actions**, mas o fluxo (buildar + fazer upload via HTTP) serve para
  qualquer CI.

---

## 1. Subir a instância

A imagem é publicada no GitHub Container Registry:
[`ghcr.io/mateusvillain/systembook`](https://github.com/mateusvillain/systembook/pkgs/container/systembook)
(multi-arch: `amd64` + `arm64`). Você não precisa clonar o repositório da
plataforma — só do compose de produção e do template de variáveis.

```bash
# Baixe o compose de produção e o template de ambiente
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/docker-compose.production.yml
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/.env.production.example

# Crie o seu .env (NÃO é commitado) a partir do template
cp .env.production.example .env
```

Edite o `.env` e preencha as **quatro variáveis obrigatórias**:

| Variável | O que é | Como preencher |
| --- | --- | --- |
| `SESSION_SECRET` | Segredo que assina os cookies de sessão. | `openssl rand -base64 32` |
| `ARGON2_SECRET` | Pepper do hash de senha (argon2id). **Não mude depois de criar usuários** — invalidaria todas as senhas. | `openssl rand -base64 32` |
| `INITIAL_ADMIN_EMAIL` | Email do admin criado automaticamente no primeiro boot. | ex.: `admin@suaempresa.com` |
| `INITIAL_ADMIN_PASSWORD` | Senha desse admin. | uma senha forte (mín. 8 caracteres) |

As variáveis opcionais (`PORT`, `DATABASE_PATH`, `PREVIEWS_PATH`) já têm default na
imagem — só descomente se quiser mudar. O SQLite e os artefatos de preview ficam no
volume nomeado `systembook-data` (montado em `/app/data`), então sobrevivem a
recriações e updates do container.

Suba:

```bash
docker compose -f docker-compose.production.yml up -d
```

No **primeiro boot** (banco vazio), o container roda as migrations e cria o admin
de bootstrap a partir de `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`. Confira
que subiu:

```bash
docker compose -f docker-compose.production.yml ps        # deve ficar "healthy"
docker compose -f docker-compose.production.yml logs -f    # acompanha o boot
```

A instância responde em `http://localhost:3000` (ou na `PORT` que você definir). Em
produção real, coloque um reverse proxy com TLS na frente (os cookies de sessão são
marcados `Secure` fora de ambiente local).

> **Antes de ir para produção**, configure um backup: todo o estado fica num único
> arquivo SQLite no volume, e o SystemBook **não** faz backup automático. Veja o
> [guia de backup e recuperação](./backup.md) (setup recomendado com Litestream).

---

## 2. Primeiro login

1. Acesse a URL da instância (ex.: `http://localhost:3000`). Você é redirecionado
   para **`/login`**.
2. Entre com o **email** e a **senha** que você definiu em `INITIAL_ADMIN_EMAIL` /
   `INITIAL_ADMIN_PASSWORD`, e clique em **Entrar**.

### Recomendado logo após o primeiro acesso

As credenciais de bootstrap vivem em texto no seu `.env` — trate-as como
provisórias:

1. **Crie um usuário nomeado para cada pessoa.** No topo da página, clique em
   **Usuários** (visível só para admins) → seção **Criar usuário**: preencha
   **Nome**, **Email**, **Senha inicial** (mín. 8) e escolha a **role** (`admin` ou
   `editor`) → **Criar usuário**.
   - `admin` e `editor` têm **os mesmos poderes sobre o conteúdo** (CRUD completo de
     seções/páginas/tabs e edição). A diferença é que só `admin` gerencia usuários e
     tokens de upload.
2. **Rotacione a credencial de bootstrap.** Na lista de **Usuários**, na linha do
   admin de bootstrap, clique em **Redefinir senha**, digite uma nova senha (mín. 8)
   e **Salvar** — isso invalida todas as sessões daquele usuário. Em seguida remova
   `INITIAL_ADMIN_PASSWORD` do `.env` (ele só é usado no primeiro boot com banco
   vazio; não é relido depois).

---

## 3. Instalar o conector no repo do design system

O `@systembook/connector` roda no **CI do seu repositório de componentes** (não na
instância): ele descobre os arquivos `*.preview.tsx`, builda cada variante e envia o
artefato estático para a instância.

No repositório do design system:

```bash
pnpm add -D @systembook/connector    # ou: npm i -D / yarn add -D
```

> **Pré-lançamento:** o pacote `@systembook/connector` ainda **não está publicado no
> npm**. Enquanto isso, o equivalente do comando de build, rodando de dentro do
> monorepo da plataforma, é
> `pnpm --filter @systembook/connector cli build --root <caminho-do-repo>`. Os
> comandos `pnpm add`/`npx` abaixo passam a valer quando o pacote for publicado.

### Escrever um primeiro `*.preview.tsx`

Ao lado de um componente, crie um arquivo `<componente>.preview.tsx` que exporta
(1) um componente `Preview` que monta o componente real e (2) um default export com
os metadados. Exemplo mínimo:

```tsx
import { Button } from './button';
import type { PreviewConfig } from '@systembook/schema';

export function Preview(props: Record<string, unknown>) {
  return <Button {...props} />;
}

export default {
  component: 'Button',
  variants: [
    { id: 'default', label: 'Default', props: { children: 'Salvar' } },
    { id: 'destructive', label: 'Destructive', props: { variant: 'destructive', children: 'Excluir' } },
  ],
  controls: [
    { kind: 'text', propName: 'children', label: 'Texto' },
    { kind: 'boolean', propName: 'disabled' },
  ],
} satisfies PreviewConfig;
```

A referência completa de todos os campos (`PreviewConfig`, `PreviewVariant`, os três
tipos de `PreviewControl`) e o contrato de runtime estão em
[o contrato do `*.preview.tsx`](./preview-tsx-schema.md).

Valide localmente que o conector descobre e builda os previews:

```bash
# forma futura (pacote publicado):
npx systembook-connector build --root .
# forma atual (de dentro do monorepo da plataforma):
pnpm --filter @systembook/connector cli build --root /caminho/para/seu-repo
```

O build escreve o artefato em `.systembook/dist/` (adicione ao `.gitignore` do repo)
com um `manifest.json` listando `{ component, variantId, entryDir }` por variante.

---

## 4. Gerar um token de upload e configurar o CI

### 4a. Gerar o token (no painel admin)

1. Logado como **admin**, clique em **Tokens** no topo → página **Tokens de upload**.
2. Em **Novo token**, dê um **Label** descritivo (ex.: `GitHub Actions do design
   system`) e clique em **Gerar token**.
3. O token aparece **uma única vez** — clique em **Copiar** e guarde num lugar
   seguro. Ele não volta a ser exibido; se perder, gere outro e **Revogue** o antigo.

### 4b. Configurar os segredos do CI

No repositório do design system (GitHub → *Settings*), crie:

- **Secret** `SYSTEMBOOK_UPLOAD_TOKEN` = o token que você acabou de copiar.
- **Variable** `SYSTEMBOOK_INSTANCE_URL` = a URL pública da instância (ex.:
  `https://docs.suaempresa.com`), sem barra no final.

### 4c. Adicionar o workflow

Adicione o workflow que builda os previews e faz upload de cada variante a cada
push. O exemplo completo e pronto para copiar (build → loop de upload por variante
lendo o `manifest.json`) está em
[Publicando previews via CI (GitHub Actions)](./ci-example.md).

No próximo push, o job builda as variantes e faz `POST /api/previews` para a
instância (autenticado pelo token). A partir daí, ao editar a documentação no
painel, o bloco **component-embed** de cada página passa a renderizar a versão mais
recente do componente real, com seletor de variante e controles interativos.

---

## Pronto

Neste ponto você tem: uma instância rodando com um volume persistente, usuários
nomeados, e o repositório do design system publicando previews de componentes reais
a cada push. Para editar a documentação, monte a estrutura de navegação
(seções → páginas → tabs) pelo painel e escreva o conteúdo no editor.

Referências relacionadas:

- [Contrato do `*.preview.tsx`](./preview-tsx-schema.md) — todos os campos e o
  contrato postMessage.
- [Publicando previews via CI](./ci-example.md) — o workflow de GitHub Actions
  completo.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — desenvolvimento da própria plataforma.
