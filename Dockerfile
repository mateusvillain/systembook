# syntax=docker/dockerfile:1

# ---------- base: Node + pnpm ----------
FROM node:24-slim AS base
RUN npm install -g pnpm@10
WORKDIR /app

# ---------- builder: instala deps e compila server + admin ----------
FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/admin/package.json apps/admin/
COPY packages/schema/package.json packages/schema/
COPY packages/preview-kit/package.json packages/preview-kit/
COPY packages/connector/package.json packages/connector/
COPY packages/docs-site/package.json packages/docs-site/
COPY packages/content/package.json packages/content/
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile

COPY . .
# @systembook/content roda no server (validação do upload de tokens, SYS-142):
# compila para dist/ antes do deploy.
RUN pnpm --filter @systembook/content build \
 && pnpm --filter @systembook/server build \
 && pnpm --filter @systembook/admin build \
 # pnpm deploy produz uma pasta autossuficiente (node_modules de produção,
 # sem symlinks de workspace) pronta para copiar ao estágio final
 # --legacy: sem injeção de workspace
 && pnpm --filter @systembook/server --prod deploy --legacy /deploy/server \
 # O deploy copia os pacotes do workspace com o exports apontando para src/
 # (TypeScript); isto aplica o publishConfig (dist/), como o pnpm pack faria.
 && node scripts/apply-publish-config.mjs /deploy/server

# ---------- runner: imagem final enxuta ----------
FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /deploy/server ./
COPY --from=builder /app/apps/admin/dist ./admin-dist
ENV ADMIN_DIST=/app/admin-dist

# O arquivo SQLite vive num volume montado, nunca dentro da imagem
ENV DATABASE_PATH=/app/data/systembook.db
VOLUME /app/data

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
