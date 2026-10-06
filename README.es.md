# Systembook

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[English](./README.md) · [Português (Brasil)](./README.pt-BR.md) · **Español**

Systembook es una plataforma open source para documentar design systems, al estilo
de Material Design Docs o del Atlassian Design System. La idea central: un
componente en la documentación es el componente real, no una captura de pantalla.
Cada uno se incrusta como una vista previa interactiva, un iframe del código real,
compilado en el CI de tu propio equipo.

Hay dos formas de ejecutarlo, y las dos terminan en la misma documentación pública:

- **Modo CMS.** Un único contenedor Docker, self-hosted, con panel de
  administración. Las personas escriben y publican desde el navegador, sin PR y sin
  despliegue de ingeniería. Tiene revisiones, usuarios y roles.
- **Modo estático.** El contenido vive en archivos `.mdx` dentro del repositorio del
  design system. El CLI genera un sitio estático que cualquier hosting gratuito
  puede servir (GitHub Pages, Vercel, Netlify). Sin servidor y sin base de datos.

Ninguno de los dos depende de un servicio de pago de terceros. Una instancia, o un
sitio, documenta un design system.

**Ejemplo en vivo** (modo estático, publicado en el GitHub Pages de este
repositorio): <https://mateusvillain.github.io/systembook/>

> Por ahora, las guías de [`docs/`](./docs) están en portugués.

## Elige un modo

| | **Modo CMS** | **Modo estático** |
| --- | --- | --- |
| **Dónde vive el contenido** | Base de datos SQLite de la instancia | Archivos `.md`/`.mdx` en el repositorio |
| **Quién edita** | Cualquier persona con login, en el editor visual | Quien tenga acceso al repositorio, en un editor de texto, mediante PR |
| **Distribución** | Imagen Docker (`ghcr.io/mateusvillain/systembook`) | Paquete npm (`@systembook/cli`) |
| **Hosting** | Un servidor tuyo ejecutando el contenedor | Cualquier hosting estático (GitHub Pages, Vercel, Netlify, S3…) |
| **Costo** | El servidor (VPS, contenedor) | Gratis en los hostings estáticos habituales |
| **Publicar** | Botón "Publish" en el panel | Merge y build en el CI |
| **Historial** | Revisiones por página, comparación por bloque, restauración | Historial de git |
| **Solo en este modo** | Editor visual, borrador con autoguardado, usuarios y roles, panel de actividad | Revisión en PR, `systembook check` en el CI, `systembook dev` con recarga, sin servidor |

La documentación pública es la misma en ambos: menús, secciones, páginas con tabs,
vistas previas interactivas con controles, bloques de do/don't, callouts, código
resaltado, búsqueda y tema oscuro.

Elige el **CMS** si quienes escriben la documentación no viven en el repositorio
(diseño, contenido) y necesitan publicar por su cuenta. Elige el **estático** si la
documentación debe ir junto al código, revisarse en el mismo PR, y prefieres no
mantener un servidor. Se puede cambiar después: mira
[migración entre modos](./docs/migration.md).

## Lo que no es

Algunas cosas están fuera del alcance, unas como backlog y otras a propósito:

- **En el modo CMS, no está basado en Git.** El contenido vive en una base de datos
  y se edita en el panel, así que no hay commit ni PR por cada edición. Si eso es lo
  que quieres, usa el modo estático.
- **No es multi-tenant.** Una instancia es un design system.
- **No construye tu biblioteca de componentes.** Systembook documenta e incrusta los
  componentes que tu equipo ya construye. No compila ni aloja su código fuente.
- **El modo CMS aún no tiene flujo de aprobación.** Quien edita publica directamente.
  El autoguardado conserva un borrador, y "Publish" crea una revisión versionada.
- **No importa archivos `.stories.tsx`.** Leer las stories de Storybook e inferir
  variantes a partir del AST está en el backlog. Por ahora, las variantes de las
  vistas previas se declaran en archivos `*.preview.tsx`.

También en el backlog: invitaciones de usuario y recuperación de contraseña por
correo, diffs más granulares entre revisiones y multi-tenancy.

## Comparación

| | **Systembook** | **Storybook** | **Zeroheight** | **Supernova** |
| --- | --- | --- | --- | --- |
| **Qué es** | Plataforma de docs con vistas previas de componentes reales | Taller de componentes con docs | Docs de design system alojadas | Plataforma de design system alojada (docs, tokens, automatización de código) |
| **Hosting** | Self-hosted (Docker) o cualquier hosting estático | Build estático self-hosted | SaaS alojado | SaaS alojado |
| **Quién escribe la doc** | Cualquier persona en un editor visual (CMS), o devs en `.mdx` (estático) | Devs, en MDX | Diseñadores y redactores, en un editor alojado | Diseñadores y redactores, en un editor alojado |
| **Vista previa de componente real** | Sí: el componente real en un iframe, con variantes y controles, compilado en tu CI | Sí, es el centro de la herramienta | Incrusta tu Storybook | Conecta datos de Storybook |
| **Sincronización con Figma** | No | Mediante addons | Sí | Sí |
| **Design tokens** | No | No | Sí | Sí |
| **Costo** | Gratis, pagas el hosting | Gratis, pagas el hosting | Plan gratuito limitado, planes de pago | Plan gratuito limitado, planes de pago |
| **Open source** | MIT | MIT | No | No |

Storybook es el mejor lugar para desarrollar y probar componentes, y su
documentación la escriben los devs. Zeroheight y Supernova sirven a equipos que
viven en Figma y quieren tokens y sincronización. Systembook es para cuando quieres
documentación editorial y los componentes reales en un solo lugar que tú alojas y
controlas, sin licencia por usuario.

## Instalación

- [Modo CMS (Docker)](#modo-cms-docker)
- [Modo estático (npm)](#modo-estático-npm)

## Modo CMS (Docker)

El modo CMS se ejecuta como un único contenedor Docker. No hay base de datos
externa, cola ni servicio de terceros que configurar. El recorrido completo
(levantar la instancia, primer login, instalar el CLI en el repositorio del design
system, configurar el CI) está en la [**guía de setup**](./docs/setup.md). Aquí va
una versión corta.

### Requisitos

- **Docker** y **Docker Compose** en la máquina que alojará la instancia.
- Un repositorio de componentes con **CI**, si quieres vistas previas reales
  (opcional para empezar).
- No necesitas clonar este repositorio para alojar Systembook. Basta con descargar el
  compose de producción y la plantilla de variables.

### 1. Descarga el compose y el `.env`

La imagen se publica en el GitHub Container Registry:
[`ghcr.io/mateusvillain/systembook`](https://github.com/mateusvillain/systembook/pkgs/container/systembook)
(multi-arch: `amd64` y `arm64`).

```bash
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/docker-compose.production.yml
curl -O https://raw.githubusercontent.com/mateusvillain/systembook/main/.env.production.example
cp .env.production.example .env
```

### 2. Completa las variables obligatorias

| Variable | Qué es | Cómo completarla |
| --- | --- | --- |
| `SESSION_SECRET` | Secreto que firma las cookies de sesión. | `openssl rand -base64 32` |
| `ARGON2_SECRET` | Pepper del hash de contraseñas (argon2id). **No lo cambies después de crear usuarios**, o todas las contraseñas dejarán de funcionar. | `openssl rand -base64 32` |
| `INITIAL_ADMIN_EMAIL` | Correo del admin que se crea en el primer arranque. | p. ej. `admin@tuempresa.com` |
| `INITIAL_ADMIN_PASSWORD` | Contraseña de ese admin. | Una contraseña segura (mín. 8 caracteres) |

Las opcionales (`PORT`, `DATABASE_PATH`, `PREVIEWS_PATH`) ya tienen valor por defecto en la imagen.

### 3. Levanta el contenedor

```bash
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps    # debe quedar "healthy"
```

En el primer arranque (base de datos vacía), el contenedor ejecuta las migrations y
crea el admin inicial a partir de las variables de entorno. Abre la instancia en el
puerto configurado (`3000` por defecto), entra en `/login`, y luego crea usuarios
con nombre y cambia la credencial de bootstrap. En producción, pon un reverse proxy
con TLS delante: las cookies de sesión son `Secure` fuera de un entorno local.

La base de datos SQLite y los artefactos de las vistas previas viven en el volumen
`systembook-data` declarado en el compose, así que sobreviven a la recreación y a
las actualizaciones del contenedor. El respaldo es responsabilidad de quien aloja la
instancia. Mira la [guía de respaldo y recuperación](./docs/backup.md) (la
configuración recomendada usa Litestream).

### 4. Actualiza la instancia

```bash
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

Las migrations pendientes se ejecutan solas cuando arranca la nueva versión. Haz un
respaldo del volumen antes de actualizar.

### 5. (Opcional) Conecta el pipeline de vistas previas

Para incrustar los componentes reales de tu design system, instala el CLI en el
repositorio de componentes y publica los artefactos desde el CI:

```bash
pnpm add -D @systembook/cli @systembook/schema   # o npm i -D / yarn add -D
npx systembook previews build --root .
```

El workflow completo de GitHub Actions está en [`docs/ci-example.md`](./docs/ci-example.md),
y el contrato de los archivos `*.preview.tsx` está en
[`docs/preview-tsx-schema.md`](./docs/preview-tsx-schema.md).

## Modo estático (npm)

Requiere Node.js 22+ y `@systembook/cli` 0.3.0 o más reciente. En el repositorio del
design system (o en una carpeta vacía):

```bash
npx @systembook/cli init     # config, docs/ con landing y una página, scripts y .gitignore
npm install                  # o pnpm install / yarn
npm run docs:dev             # http://localhost:4000, recarga al guardar
```

`init` pregunta si debe crear el workflow de despliegue en GitHub Pages (pasa
`--github-pages` o `--no-github-pages` para que no pregunte). Si `docs/` ya contiene
otra documentación, el contenido va a `systembook-docs/`. A partir de ahí:

| Comando | Qué hace |
| --- | --- |
| `systembook dev` | Servidor local; los errores de contenido aparecen en un overlay |
| `systembook check` | Valida contenido, enlaces, imágenes y vistas previas (ejecútalo en los PR) |
| `systembook build` | Genera el sitio en `systembook-dist/` |

- [**Formato del contenido**](./docs/static-format.md): carpetas, frontmatter,
  bloques y componentes MDX (`<Callout>`, `<ComponentEmbed>`, `<DosDonts>`).
- [**Publicación**](./docs/deploy-static.md): GitHub Pages, Vercel, Netlify y otros
  hostings.
- [**Proyecto de ejemplo**](./examples/static-docs): un design system completo en
  este formato, con vistas previas. Es lo que está publicado en
  <https://mateusvillain.github.io/systembook/>.
- [**Migración entre modos**](./docs/migration.md).
- Las vistas previas de componentes usan los mismos archivos `*.preview.tsx` del
  modo CMS ([contrato](./docs/preview-tsx-schema.md)), y `build` los incluye en el
  sitio.

## Desarrollo

La configuración local (dos procesos en dev, checks de CI, convenciones) está en
[`CONTRIBUTING.md`](./CONTRIBUTING.md). Las notas de arquitectura y las trampas del
repositorio están en [`CLAUDE.md`](./CLAUDE.md).

```bash
git clone https://github.com/mateusvillain/systembook.git
cd systembook
pnpm install
pnpm dev                               # server (puerto 3000)
pnpm --filter @systembook/admin dev    # panel admin (puerto 5173)
```

## Licencia

[MIT](./LICENSE). Las contribuciones son bienvenidas, mira
[`CONTRIBUTING.md`](./CONTRIBUTING.md).
