# Systembook

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**English** · [Português (Brasil)](./README.pt-BR.md)

Systembook is an open source platform for documenting design systems, in the
style of Material Design docs or the Atlassian Design System. Its main idea: a
component in the docs is the real component, not a screenshot. Each one is
embedded as an interactive preview, an iframe of the actual code, built in your
own CI.

There are two ways to run it, and both end in the same public docs:

- **CMS mode.** One self-hosted Docker container with an admin panel. People write
  and publish in the browser, with no PR and no engineering deploy. It has
  revisions, users and roles.
- **Static mode.** Content lives in `.mdx` files in your design system's repository.
  The CLI builds a static site that any free host can serve (GitHub Pages, Vercel,
  Netlify). No server, no database.

Neither mode depends on a paid third-party service. One instance, or one site,
documents one design system.

**Live example** (static mode, published with this repository's GitHub Pages):
<https://mateusvillain.github.io/systembook/>

> The guides in [`docs/`](./docs) are written in Portuguese for now.

## Pick a mode

| | **CMS mode** | **Static mode** |
| --- | --- | --- |
| **Where content lives** | The instance's SQLite database | `.md`/`.mdx` files in the repository |
| **Who edits** | Anyone with a login, in the visual editor | Anyone with repo access, in a text editor, through a PR |
| **Distribution** | Docker image (`ghcr.io/mateusvillain/systembook`) | npm package (`@systembook/cli`) |
| **Hosting** | A server of yours running the container | Any static host (GitHub Pages, Vercel, Netlify, S3…) |
| **Cost** | The server (VPS, container) | Free on the usual static hosts |
| **Publishing** | "Publish" button in the panel | Merge, then a CI build |
| **History** | Per-page revisions, block-level compare, restore | Git history |
| **Only in this mode** | Visual editor, draft autosave, users and roles, activity dashboard | PR review, `systembook check` in CI, `systembook dev` with reload, no server |

The public docs are the same in both: menus, sections, pages with tabs,
interactive previews with controls, do/don't blocks, callouts, highlighted code,
search and a dark theme.

Pick **CMS** if the people writing docs don't live in the repository (design,
content) and need to publish on their own. Pick **static** if docs should travel
with the code, get reviewed in the same PR, and you'd rather not run a server. You
can switch later: see [migrating between modes](./docs/migration.md).

## What it isn't

A few things are out of scope, some as backlog and some on purpose:

- **In CMS mode, it isn't Git-based.** Content lives in a database and is edited in
  the panel, so there's no commit or PR per edit. If you want that, use static mode.
- **It isn't multi-tenant.** One instance is one design system.
- **It doesn't build your component library.** Systembook documents and embeds the
  components your team already builds. It doesn't compile or host their source.
- **CMS mode has no approval flow yet.** Editors publish directly. Autosave keeps a
  draft, and "Publish" creates a versioned revision.
- **It doesn't import `.stories.tsx` files.** Reading Storybook stories and
  inferring variants from the AST is on the backlog. For now, preview variants are
  declared in `*.preview.tsx` files.

Also on the backlog: user invites and password recovery by email, finer-grained
revision diffs, and multi-tenancy.

## How it compares

| | **Systembook** | **Storybook** | **Zeroheight** | **Supernova** |
| --- | --- | --- | --- | --- |
| **What it is** | Docs platform with real component previews | Component workshop with docs | Hosted design system docs | Hosted design system platform (docs, tokens, code automation) |
| **Hosting** | Self-hosted (Docker) or any static host | Self-hosted static build | Hosted SaaS | Hosted SaaS |
| **Who writes the docs** | Anyone in a visual editor (CMS), or developers in `.mdx` (static) | Developers, in MDX | Designers and writers, in a hosted editor | Designers and writers, in a hosted editor |
| **Real component previews** | Yes: the real component in an iframe, with variants and controls, built in your CI | Yes, it's the core of the tool | Embeds your Storybook | Connects Storybook data |
| **Figma sync** | No | Through addons | Yes | Yes |
| **Design tokens** | No | No | Yes | Yes |
| **Cost** | Free, you pay for hosting | Free, you pay for hosting | Free tier with limits, paid plans | Free tier with limits, paid plans |
| **Open source** | MIT | MIT | No | No |

Storybook is the best place to develop and test components, and its docs are
written by developers. Zeroheight and Supernova suit teams that live in Figma and
want tokens and sync. Systembook is for when you want editorial docs and the real
components in one place that you host and control, without a per-seat license.

## Installation

- [CMS mode (Docker)](#cms-mode-docker)
- [Static mode (npm)](#static-mode-npm)

## CMS mode (Docker)

CMS mode runs as a single Docker container. There's no external database, queue or
third-party service to set up. The full walkthrough (starting the instance, first
login, installing the CLI in the design system repo, wiring up CI) is in the
[**setup guide**](./docs/setup.md). A short version follows.

### Requirements

- **Docker** and **Docker Compose** on the machine that will host the instance.
- A component repository with **CI**, if you want real previews (optional to start).
- You don't need to clone this repository to host Systembook. Just download the
  production compose file and the env template.

### 1. Download the compose file and `.env`

The image is published on the GitHub Container Registry:
[`ghcr.io/mateusvillain/systembook`](https://github.com/mateusvillain/systembook/pkgs/container/systembook)
(multi-arch: `amd64` and `arm64`).

```bash
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/docker-compose.production.yml
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/.env.production.example
cp .env.production.example .env
```

### 2. Fill in the required variables

| Variable | What it is | How to fill it |
| --- | --- | --- |
| `SESSION_SECRET` | Secret that signs session cookies. | `openssl rand -base64 32` |
| `ARGON2_SECRET` | Pepper for password hashing (argon2id). **Don't change it after creating users**, or every password stops working. | `openssl rand -base64 32` |
| `INITIAL_ADMIN_EMAIL` | Email of the admin created on first boot. | e.g. `admin@yourcompany.com` |
| `INITIAL_ADMIN_PASSWORD` | That admin's password. | A strong password (8+ characters) |

The optional ones (`PORT`, `DATABASE_PATH`, `PREVIEWS_PATH`) have defaults in the image.

### 3. Start the container

```bash
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps    # should become "healthy"
```

On first boot (empty database) the container runs the migrations and seeds the
initial admin from the environment variables. Open the instance on the configured
port (`3000` by default), sign in at `/login`, then create named users and rotate
the bootstrap credential. In production, put a reverse proxy with TLS in front:
session cookies are `Secure` outside local environments.

The SQLite database and the preview artifacts live in the `systembook-data` volume
declared in the compose file, so they survive container recreation and updates.
Backups are up to whoever hosts the instance. See the
[backup and recovery guide](./docs/backup.md) (Litestream is the recommended setup).

### 4. Update the instance

```bash
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

Pending migrations run automatically when the new version boots. Back up the volume
before you update.

### 5. (Optional) Connect the previews pipeline

To embed your design system's real components, install the CLI in the component
repository and publish the artifacts from CI:

```bash
pnpm add -D @systembook/cli @systembook/schema   # or npm i -D / yarn add -D
npx systembook previews build --root .
```

The full GitHub Actions workflow is in [`docs/ci-example.md`](./docs/ci-example.md),
and the `*.preview.tsx` contract is in
[`docs/preview-tsx-schema.md`](./docs/preview-tsx-schema.md).

## Static mode (npm)

Needs Node.js 22+ and `@systembook/cli` 0.3.0 or newer. In your design system's
repository (or an empty folder):

```bash
npx @systembook/cli init     # config, docs/ with a landing page and one page, scripts, .gitignore
npm install                  # or pnpm install / yarn
npm run docs:dev             # http://localhost:4000, reloads on save
```

`init` asks whether to create the GitHub Pages deploy workflow (pass
`--github-pages` or `--no-github-pages` to skip the question). If `docs/` already
holds other documentation, the content goes to `systembook-docs/`. From there:

| Command | What it does |
| --- | --- |
| `systembook dev` | Local server; content errors show up in an overlay |
| `systembook check` | Validates content, links, images and previews (run it on PRs) |
| `systembook build` | Builds the site into `systembook-dist/` |

- [**Content format**](./docs/static-format.md): folders, frontmatter, blocks and
  MDX components (`<Callout>`, `<ComponentEmbed>`, `<DosDonts>`).
- [**Publishing**](./docs/deploy-static.md): GitHub Pages, Vercel, Netlify and
  other hosts.
- [**Example project**](./examples/static-docs): a complete design system in this
  format, with previews. It's what's published at
  <https://mateusvillain.github.io/systembook/>.
- [**Migrating between modes**](./docs/migration.md).
- Component previews use the same `*.preview.tsx` files as CMS mode
  ([contract](./docs/preview-tsx-schema.md)), and `build` includes them in the site.

## Development

Local setup (two processes in dev, CI checks, conventions) is in
[`CONTRIBUTING.md`](./CONTRIBUTING.md). Architecture notes and repository gotchas
are in [`CLAUDE.md`](./CLAUDE.md).

```bash
git clone https://github.com/mateusvillain/systembook.git
cd systembook
pnpm install
pnpm dev                               # server (port 3000)
pnpm --filter @systembook/admin dev    # admin panel (port 5173)
```

## License

[MIT](./LICENSE). Contributions are welcome, see
[`CONTRIBUTING.md`](./CONTRIBUTING.md).
