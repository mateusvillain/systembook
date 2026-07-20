import { createServer } from 'node:http';
import { nodeHTTPRequestHandler } from '@trpc/server/adapters/node-http';
import type { Block } from '@systembook/schema';
import { loadEnv } from './env.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedBootstrapAdmin } from './db/seed.js';
import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { handlePreviewUpload } from './previews/upload.js';
import { resolveAdminDist, serveStatic } from './static.js';

// Verificação de resolução cross-package (TASK-3): o import de tipo abaixo
// deve compilar sem erros.
type _SchemaLinkCheck = Block['type'];

const env = loadEnv();

const db = createDb(env.DATABASE_PATH);
runMigrations(db);
await seedBootstrapAdmin(db);

const adminDist = resolveAdminDist();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${env.PORT}`);

  if (url.pathname.startsWith('/trpc/')) {
    void nodeHTTPRequestHandler({
      router: appRouter,
      req,
      res,
      path: url.pathname.slice('/trpc/'.length),
      createContext: () => createContext(db, req, res),
    });
    return;
  }

  // Upload de artefato de preview pelo CI (TASK-43) — fora do tRPC de
  // propósito: multipart + auth por token de upload, não sessão.
  if (url.pathname === '/api/previews' && req.method === 'POST') {
    void handlePreviewUpload(req, res, { db, previewsRoot: env.PREVIEWS_PATH });
    return;
  }

  if (adminDist) {
    serveStatic(adminDist, url.pathname === '/' ? '/index.html' : url.pathname, res);
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'admin build não encontrado — em dev, use o vite dev server' }));
});

server.listen(env.PORT, () => {
  console.log(`[server] SystemBook ouvindo em http://localhost:${env.PORT}`);
  console.log(`[server] admin estático: ${adminDist ?? 'não encontrado (ok em dev)'}`);
});
