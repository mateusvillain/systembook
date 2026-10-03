import { readdirSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createLogger, createServer, type Plugin, type ViteDevServer } from 'vite';
import { discoverPreviews, type DiscoveryResult } from '@systembook/connector';
import { siteDataFiles, STATIC_DATA_DIR } from '@systembook/content';
import { appViteConfig, buildPreviews } from '../app.js';
import { CONFIG_FILES, ConfigError, loadConfig } from '../config.js';
import { META_FILE, notFoundHead, renderHtml, routeMetas, type RouteMeta } from '../build/html.js';
import { MEDIA_DIR, prepareSite, PREVIEWS_DIR, previewsBase } from '../build/prepare.js';
import { notFound, sendFile, sendJson } from './static.js';

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

/** Teto para esperar a varredura inicial do watcher (projetos enormes). */
const WATCH_TIMEOUT_MS = 15_000;

/** Agrupa os eventos de um "salvar" (editores gravam em mais de um passo). */
const DEBOUNCE_MS = 80;

/**
 * `systembook dev` (SYS-103): o site do `build` servido pelo Vite, com os
 * dados gerados em memória a partir do conteúdo. Salvar um `.mdx`, um
 * `_menu.yml`/`_section.yml`, uma imagem, a config ou um `*.preview.tsx` (ou
 * o que ele importa) refaz só o necessário e recarrega o navegador. Erros de
 * conteúdo aparecem no terminal e no overlay do Vite; o servidor continua de
 * pé, com o que deu para gerar (e os previews do último build que passou) —
 * para corrigir e salvar de novo.
 */
export async function startDevServer(root: string, options: DevOptions = {}): Promise<DevServer> {
  // Sem config válida não há o que servir: o erro da primeira carga sobe.
  let config = await loadConfig(root);
  const previewsDir = path.join(root, '.systembook', 'dev', 'previews');

  let site: Site = { data: new Map(), media: new Map(), routes: [] };
  /** Da última config lida; enquanto houver, o servidor segue com a última válida. */
  let configProblems: string[] = [];
  /** Do conteúdo, das referências e do build dos previews. */
  let siteProblems: string[] = [];
  const problems = () => [...configProblems, ...siteProblems];
  let discovery: DiscoveryResult | null = null;
  let server: ViteDevServer;
  let port = options.port ?? 4000;
  let strictPort = false;
  let watching: Promise<unknown> = Promise.resolve();

  const logger = createLogger('info', { prefix: '[systembook]' });

  /** Refaz o que a mudança afeta; devolve se o site servido mudou. */
  async function rebuild(change: Change): Promise<boolean> {
    let previewsChanged = false;
    if (change !== 'content' || !discovery) {
      discovery = config.previews === false ? { previews: [], failures: [] } : await discoverPreviews({ root });
    }
    const prepared = await prepareSite(config, { discovery });
    const current = [...prepared.problems];

    if (change !== 'content') {
      // Os previews são o artefato do `previews build`, como no site final,
      // refeitos a cada mudança de código. O build vai para uma pasta ao lado
      // e só substitui a servida se passar: até lá (e se falhar), o iframe
      // segue com o anterior.
      const next = `${previewsDir}-next`;
      await rm(next, { recursive: true, force: true });
      try {
        if (prepared.previews.length) {
          await buildPreviews(config, prepared.previews, { outDir: next, base: previewsBase(config) });
        }
        await rm(previewsDir, { recursive: true, force: true });
        if (prepared.previews.length) await rename(next, previewsDir);
        previewsChanged = true;
      } catch (error) {
        current.push(`previews: ${(error as Error).message}`);
      }
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
    siteProblems = current;
    return changed;
  }

  function sendProblems() {
    server.ws.send({
      type: 'error',
      err: { message: problems().join('\n'), stack: '', plugin: 'systembook' },
    });
  }

  function report() {
    const all = problems();
    if (all.length) {
      for (const problem of all) logger.error(problem);
      logger.error(`${all.length} erro(s) — corrija e salve; o servidor segue de pé.`, { timestamp: true });
    }
    options.onUpdate?.({ problems: all });
  }

  /** O plugin que serve os dados, as mídias e os previews, e põe o `<head>`. */
  const sitePlugin: Plugin = {
    name: 'systembook:dev-site',
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => serveSite(req, res, next));
      // Quem abre (ou recarrega) a página com erro pendente também vê o overlay.
      vite.ws.on('connection', () => {
        if (problems().length) sendProblems();
      });
      vite.watcher.add(root);
      watching = untilWatched(vite.watcher, projectDirs(root, [config.outDir, path.join(root, '.systembook')]));
      vite.watcher.on('all', (_event, file) => onFileChange(file));
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const pathname = sitePathname(ctx.originalUrl ?? ctx.path);
        const route = pathname === null ? undefined : site.routes.find((r) => r.path === pathname);
        return renderHtml(html, route ?? notFoundHead(config.name));
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

  /** A base anterior de onde `req` veio, se for o caso de redirecionar para a atual. */
  function oldBaseOf(req: IncomingMessage): string | undefined {
    const url = req.url ?? '/';
    if (url.startsWith(config.base)) return undefined;
    return [...oldBases].find((base) =>
      // A raiz casa com tudo: dela, só as páginas (não `/favicon.ico`, `/@fs/…`).
      base === '/' ? (req.headers.accept ?? '').includes('text/html') : url.startsWith(base) || url === base.slice(0, -1),
    );
  }

  function serveSite(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const old = oldBaseOf(req);
    if (old) {
      res.statusCode = 302;
      res.setHeader('Location', `${config.base}${(req.url ?? '/').slice(old.length)}`);
      return res.end();
    }
    const pathname = sitePathname(req.url ?? '/');
    if (pathname === null || !pathname.startsWith('/_systembook/')) return next();
    const file = pathname.slice(1);

    if (file.startsWith(STATIC_DATA_DIR)) {
      const json = site.data.get(file.slice(STATIC_DATA_DIR.length));
      return json === undefined ? notFound(res) : sendJson(res, json);
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
      // A fila nunca fica rejeitada: um erro aqui não pode parar o watch.
      running = running.then(flush).catch((error: unknown) => logger.error(String(error)));
    }, DEBOUNCE_MS);
  }

  async function flush() {
    const change = pending;
    pending = null;
    if (!change) return;
    try {
      await update(change);
    } catch (error) {
      siteProblems = [`erro inesperado: ${(error as Error).stack ?? String(error)}`];
      sendProblems();
      report();
    }
  }

  async function update(change: Change) {
    const hadProblems = problems().length > 0;
    if (change === 'config') {
      let next;
      try {
        next = await loadConfig(root);
        configProblems = [];
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        configProblems = error.problems;
        sendProblems();
        report();
        return;
      }
      if (next.base !== config.base) {
        // A base é do Vite: muda a URL de tudo. O navegador reconecta sozinho
        // e recarrega na base velha, que redireciona para a nova.
        oldBases.add(config.base);
        oldBases.delete(next.base);
        config = next;
        await rebuild('config');
        await restart();
        logger.info(`base mudou para ${config.base} — ${url()}`, { timestamp: true });
        report();
        return;
      }
      config = next;
    }
    const changed = await rebuild(change);
    if (problems().length) {
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
    const name = path.basename(file);
    // O `.mjs` temporário que o `loadConfig` escreve (e apaga) ao lado da config.
    if (name.startsWith('.systembook-config-')) return null;
    if (path.dirname(file) === root && CONFIG_FILES.includes(name)) return 'config';
    // Código vale onde estiver, inclusive um `*.preview.tsx` junto do conteúdo.
    if (CODE_FILE.test(file)) return 'code';
    // O resto (conteúdo, imagens, logos) é refeito com o conteúdo, sem recarga
    // se nada mudar no site.
    return 'content';
  }

  const url = () => `http://localhost:${port}${config.base}`;

  async function listen() {
    const app = appViteConfig(config);
    const posix = (dir: string) => dir.split(path.sep).join('/');
    server = await createServer({
      ...app,
      plugins: [...(app.plugins ?? []), sitePlugin],
      server: {
        ...app.server,
        port,
        strictPort,
        watch: { ignored: [`${posix(config.outDir)}/**`, `${posix(path.join(root, '.systembook'))}/**`] },
      },
    });
    await server.listen();
    await watching;
    // Depois da 1ª vez, a porta é fixa: o navegador reconecta na mesma.
    port = (server.httpServer!.address() as AddressInfo).port;
    strictPort = true;
  }

  /** Recria o servidor (mudou a base); com a porta tomada no meio, usa outra. */
  async function restart() {
    await server.close();
    try {
      await listen();
    } catch (error) {
      logger.warn(`porta ${port} indisponível (${(error as Error).message}) — usando outra.`, { timestamp: true });
      strictPort = false;
      await listen();
    }
  }

  try {
    await rebuild('code');
  } catch (error) {
    // Erro fora do conteúdo (um `*.preview.tsx` que nem carrega): o servidor
    // sobe assim mesmo, com o erro no overlay.
    siteProblems = [`erro inesperado: ${(error as Error).stack ?? String(error)}`];
  }
  await listen();
  logger.info(`\n  SystemBook dev — ${config.name}\n  ➜ ${url()}\n`);
  report();

  return {
    get url() {
      return url();
    },
    async close() {
      if (timer) clearTimeout(timer);
      pending = null;
      await running;
      await server.close();
    },
  };
}

/** Pastas do projeto que o watcher precisa cobrir (as que ele não ignora). */
function projectDirs(root: string, ignored: string[]): string[] {
  const skip = new Set(['node_modules', '.git', 'test-results']);
  const dirs = [root];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(entry.parentPath, entry.name);
    const parts = path.relative(root, dir).split(path.sep);
    if (parts.some((part) => skip.has(part))) continue;
    if (ignored.some((other) => dir === other || dir.startsWith(`${other}${path.sep}`))) continue;
    dirs.push(dir);
  }
  return dirs;
}

/**
 * Espera o watcher cobrir todas as `dirs`. O `add` da raiz é assíncrono, e o
 * `ready` do chokidar não espera pela varredura de um caminho acrescentado
 * depois do início: sem isto, um save logo após a subida podia cair antes de a
 * pasta ser vigiada e se perder (no Linux, sob carga, isso acontecia). Num
 * projeto enorme, desiste depois de `WATCH_TIMEOUT_MS` — o pior caso volta a
 * ser o de antes.
 */
async function untilWatched(watcher: ViteDevServer['watcher'], dirs: string[]): Promise<void> {
  const deadline = Date.now() + WATCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const watched = watcher.getWatched();
    if (dirs.every((dir) => watched[dir] !== undefined)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Uma impressão do site servido, para recarregar o navegador só quando algo mudou. */
function fingerprint(site: Site): string {
  return JSON.stringify([[...site.data], [...site.media]]);
}
