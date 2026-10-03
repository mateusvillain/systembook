import { createReadStream, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createLogger, createServer, type Plugin, type ViteDevServer } from 'vite';
import { discoverPreviews, type DiscoveryResult } from '@systembook/connector';
import { siteDataFiles, STATIC_DATA_DIR } from '@systembook/content';
import { appViteConfig, buildPreviews } from '../app.js';
import { CONFIG_FILES, ConfigError, loadConfig } from '../config.js';
import { META_FILE, renderHtml, routeMetas, type RouteMeta } from '../build/html.js';
import { MEDIA_DIR, prepareSite, PREVIEWS_DIR } from '../build/prepare.js';

export interface DevOptions {
  /** Porta; ocupada, o Vite tenta a seguinte. */
  port?: number;
  /** Chamado ao fim de cada atualização (a primeira inclusive), com os problemas atuais. */
  onUpdate?: (update: { problems: string[] }) => void;
}

export interface DevServer {
  /** URL do site, com a base. */
  url: string;
  close(): Promise<void>;
}

/** O que o servidor entrega além do app: o equivalente em memória do `outDir`. */
interface Site {
  /** Arquivo da pasta de dados (`nav.json`, `pages/…`) → JSON. */
  data: Map<string, string>;
  /** Caminho no site (`_systembook/media/logo-1a2b3c4d.svg`) → arquivo do projeto. */
  media: Map<string, string>;
  routes: RouteMeta[];
}

/** Do que depende uma mudança: só o conteúdo, os previews (código) ou a config. */
type Change = 'content' | 'code' | 'config';
const WEIGHT: Record<Change, number> = { content: 0, code: 1, config: 2 };

/** Arquivos que podem mudar os previews: o `*.preview.tsx` e o que ele importa. */
const CODE_FILE = /\.(tsx?|jsx?|[mc][jt]s|css|scss|sass|less|json)$/i;

/** Agrupa os eventos de um "salvar" (editores gravam em mais de um passo). */
const DEBOUNCE_MS = 80;

/**
 * `systembook dev` (SYS-103): o site do `build` servido pelo Vite, com os
 * dados gerados em memória a partir do conteúdo. Salvar um `.mdx`, um
 * `_menu.yml`/`_section.yml`, uma imagem, a config ou um `*.preview.tsx` (ou
 * o que ele importa) refaz só o necessário e recarrega o navegador. Erros de
 * conteúdo aparecem no terminal e no overlay do Vite; o servidor continua de
 * pé, servindo o último estado — para corrigir e salvar de novo.
 */
export async function startDevServer(root: string, options: DevOptions = {}): Promise<DevServer> {
  // Sem config válida não há o que servir: o erro da primeira carga sobe.
  let config = await loadConfig(root);
  const previewsDir = path.join(root, '.systembook', 'dev', 'previews');

  let site: Site = { data: new Map(), media: new Map(), routes: [] };
  let problems: string[] = [];
  let discovery: DiscoveryResult | null = null;
  let server: ViteDevServer;
  let port = options.port ?? 4000;
  let strictPort = false;

  const logger = createLogger('info', { prefix: '[systembook]' });

  /** Refaz o que a mudança afeta; devolve se o site servido mudou. */
  async function rebuild(change: Change): Promise<boolean> {
    const current: string[] = [];
    let previewsChanged = false;
    if (change !== 'content' || !discovery) {
      discovery = config.previews === false ? { previews: [], failures: [] } : await discoverPreviews({ root });
    }
    const prepared = await prepareSite(config, { discovery });
    current.push(...prepared.problems);

    if (change !== 'content') {
      // Os previews são o artefato do `previews build`, como no site final:
      // refeitos a cada mudança de código, com o iframe lendo da pasta.
      await rm(previewsDir, { recursive: true, force: true });
      if (prepared.previews.length) {
        try {
          await buildPreviews(config, prepared.previews, {
            outDir: previewsDir,
            base: `${config.base}${PREVIEWS_DIR}/`,
          });
        } catch (error) {
          current.push(`previews: ${(error as Error).message}`);
        }
      }
      previewsChanged = true;
    }

    const data = siteDataFiles(prepared.site.data);
    const routes = routeMetas(prepared.site.data, prepared.tree.landing?.titulo ?? null);
    data.set(META_FILE, `${JSON.stringify(routes)}\n`);
    const next: Site = {
      data,
      media: new Map(prepared.media.map((file) => [file.target, file.source])),
      routes,
    };
    const changed = previewsChanged || fingerprint(next) !== fingerprint(site);
    site = next;
    problems = current;
    return changed;
  }

  function sendProblems() {
    server.ws.send({
      type: 'error',
      err: { message: problems.join('\n'), stack: '', plugin: 'systembook' },
    });
  }

  function report() {
    if (problems.length) {
      for (const problem of problems) logger.error(problem);
      logger.error(`${problems.length} erro(s) — o site mostra o último estado; corrija e salve.`, { timestamp: true });
    }
    options.onUpdate?.({ problems });
  }

  /** O plugin que serve os dados, as mídias e os previews, e põe o `<head>`. */
  const sitePlugin: Plugin = {
    name: 'systembook:dev-site',
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => serveSite(req, res, next));
      // Quem abre (ou recarrega) a página com erro pendente também vê o overlay.
      vite.ws.on('connection', () => {
        if (problems.length) sendProblems();
      });
      vite.watcher.add(root);
      vite.watcher.on('all', (_event, file) => onFileChange(file));
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const pathname = sitePathname(ctx.originalUrl ?? ctx.path);
        const route = pathname === null ? undefined : site.routes.find((r) => r.path === pathname);
        return renderHtml(html, route ?? { title: `Page not found · ${config.name}`, description: config.name });
      },
    },
  };

  /** O caminho de uma URL do site sem a base, sem barra no fim (`''` = landing). */
  function sitePathname(url: string): string | null {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(url, 'http://x').pathname);
    } catch {
      return null;
    }
    const base = config.base.replace(/\/$/, '');
    if (!pathname.startsWith(`${base}/`) && pathname !== base) return null;
    return pathname.slice(base.length).replace(/\/$/, '');
  }

  /** Bases anteriores: a aba aberta recarrega na URL velha depois de a base mudar. */
  const oldBases = new Set<string>();

  function serveSite(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const requested = req.url ?? '/';
    const old = [...oldBases].find((base) => requested.startsWith(base));
    if (old && !requested.startsWith(config.base)) {
      res.statusCode = 302;
      res.setHeader('Location', `${config.base}${requested.slice(old.length)}`);
      return res.end();
    }
    const pathname = sitePathname(requested);
    if (pathname === null || !pathname.startsWith('/_systembook/')) return next();
    const file = pathname.slice(1);

    const dataDir = STATIC_DATA_DIR;
    if (file.startsWith(dataDir)) {
      const json = site.data.get(file.slice(dataDir.length));
      if (json === undefined) return notFound(res);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(json);
    }
    if (file.startsWith(`${MEDIA_DIR}/`)) {
      const source = site.media.get(file);
      return source ? sendFile(res, source) : notFound(res);
    }
    if (file.startsWith(`${PREVIEWS_DIR}/`)) {
      // O iframe do preview é sandboxed (origem opaca): os scripts `type=module`
      // dele só carregam com CORS liberado, como no site publicado.
      res.setHeader('Access-Control-Allow-Origin', '*');
      const relative = file.slice(PREVIEWS_DIR.length + 1) || 'index.html';
      const target = path.resolve(previewsDir, relative.endsWith('/') ? `${relative}index.html` : relative);
      if (!target.startsWith(`${previewsDir}${path.sep}`)) return notFound(res);
      return sendFile(res, target);
    }
    return notFound(res);
  }

  // ---- fila de atualizações: uma por vez, juntando o que chegar no meio ----
  let pending: Change | null = null;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> = Promise.resolve();

  function onFileChange(file: string) {
    const change = classify(file);
    if (!change) return;
    if (pending === null || WEIGHT[change] > WEIGHT[pending]) pending = change;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      running = running.then(flush);
    }, DEBOUNCE_MS);
  }

  async function flush() {
    const change = pending;
    pending = null;
    if (!change) return;
    try {
      await update(change);
    } catch (error) {
      problems = [`erro inesperado: ${(error as Error).stack ?? String(error)}`];
      sendProblems();
      report();
    }
  }

  async function update(change: Change) {
    const hadProblems = problems.length > 0;
    if (change === 'config') {
      try {
        const next = await loadConfig(root);
        const restart = next.base !== config.base;
        if (restart) oldBases.add(config.base);
        config = next;
        if (restart) {
          // A base é do Vite: muda a URL de tudo. O navegador reconecta sozinho.
          await rebuild('config');
          await server.close();
          await listen();
          logger.info(`base mudou para ${config.base} — ${url()}`, { timestamp: true });
          report();
          return;
        }
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        problems = error.problems;
        sendProblems();
        report();
        return;
      }
    }
    const changed = await rebuild(change);
    if (problems.length) {
      sendProblems();
    } else if (changed || hadProblems) {
      server.ws.send({ type: 'full-reload', path: '*' });
      logger.info(`atualizado — ${site.routes.length} rota(s)`, { timestamp: true });
    }
    report();
  }

  /** Que parte refazer quando `file` muda; `null` = nada a ver com o site. */
  function classify(file: string): Change | null {
    const inside = (dir: string) => file === dir || file.startsWith(`${dir}${path.sep}`);
    if (!inside(root) || inside(config.outDir) || inside(path.join(root, '.systembook'))) return null;
    if (path.dirname(file) === root && CONFIG_FILES.includes(path.basename(file))) return 'config';
    if (inside(config.contentDir)) return 'content';
    // Logos e afins: refeitos com o conteúdo (sem recarga se nada mudar).
    return CODE_FILE.test(file) ? 'code' : 'content';
  }

  const url = () => `http://localhost:${port}${config.base}`;

  async function listen() {
    const app = appViteConfig(config);
    server = await createServer({
      ...app,
      plugins: [...(app.plugins ?? []), sitePlugin],
      server: {
        ...app.server,
        port,
        strictPort,
        watch: { ignored: [`${config.outDir}/**`, `${path.join(root, '.systembook')}/**`] },
      },
    });
    await server.listen();
    // Depois da 1ª vez, a porta é fixa: o navegador reconecta na mesma.
    port = (server.httpServer!.address() as AddressInfo).port;
    strictPort = true;
  }

  await rebuild('code');
  await listen();
  logger.info(`\n  SystemBook dev — ${config.name}\n  ➜ ${url()}\n`);
  report();

  return {
    url: url(),
    async close() {
      if (timer) clearTimeout(timer);
      await running;
      await server.close();
    },
  };
}

/** Uma impressão do site servido, para recarregar o navegador só quando algo mudou. */
function fingerprint(site: Site): string {
  return JSON.stringify([[...site.data], [...site.media]]);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(res: ServerResponse, file: string) {
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return notFound(res);
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  createReadStream(file).pipe(res);
}

function notFound(res: ServerResponse) {
  res.statusCode = 404;
  res.end('Not found');
}
