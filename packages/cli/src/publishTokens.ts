import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ResolvedConfig } from './config.js';
import { loadProjectTokens } from './tokens.js';

export interface PublishTokensOptions {
  /** URL da instância CMS (`https://docs.acme.dev`). */
  to: string;
  /** Token de escopo `tokens` (Settings → Upload tokens). */
  token: string;
  /** Commit dos arquivos; sem ele, `GITHUB_SHA` ou o `HEAD` do git na raiz. */
  commit?: string;
  /** Injetável nos testes. */
  fetch?: typeof fetch;
  /** Injetável nos testes (o `GITHUB_SHA`). */
  env?: NodeJS.ProcessEnv;
}

export interface PublishTokensOutcome {
  commitSha: string;
  modes: string[];
  tokens: number;
  /** Avisos do parser (locais e os que a instância devolveu), já formatados. */
  warnings: string[];
}

/** Erro de uso, de tokens ou de comunicação, com uma linha por problema. */
export class PublishTokensError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
    this.name = 'PublishTokensError';
  }
}

interface ServerDiagnostic {
  file: string;
  path?: string;
  message: string;
}

/** `arquivo  caminho: mensagem`, como o `formatTokenDiagnostic` da CLI. */
const format = (d: ServerDiagnostic) => `${d.file}  ${d.path ? `${d.path}: ` : ''}${d.message}`;

/** O commit dos arquivos: a opção, o do CI (GitHub Actions) ou o `HEAD` do repositório. */
async function resolveCommit(root: string, options: PublishTokensOptions): Promise<string> {
  const explicit = options.commit ?? (options.env ?? process.env).GITHUB_SHA;
  if (explicit?.trim()) return explicit.trim();
  try {
    const { stdout } = await promisify(execFile)('git', ['rev-parse', 'HEAD'], { cwd: root });
    return stdout.trim();
  } catch {
    throw new PublishTokensError(['não foi possível descobrir o commit — informe com --commit (ou rode dentro do repositório git).']);
  }
}

/**
 * `systembook tokens` (SYS-144): lê os tokens da config, valida como o
 * `systembook check` e envia os arquivos DTCG para o `POST /api/tokens` da
 * instância, que valida de novo e publica. Com qualquer erro local nada é
 * enviado — inclusive os de configuração, que só a CLI enxerga (padrão que
 * não casa, arquivo em base e num modo).
 */
export async function publishTokens(config: ResolvedConfig, options: PublishTokensOptions): Promise<PublishTokensOutcome> {
  let base: URL;
  try {
    base = new URL(options.to);
  } catch {
    throw new PublishTokensError([`--to precisa ser a URL da instância (ex.: https://docs.acme.dev), não "${options.to}".`]);
  }
  if (!config.tokens) {
    throw new PublishTokensError([`${config.file}: sem "tokens" — configure os arquivos de tokens antes de publicar (docs/tokens.md).`]);
  }

  const loaded = await loadProjectTokens(config);
  if (loaded.problems.length) {
    throw new PublishTokensError([...loaded.problems, 'nada foi enviado.']);
  }
  const commitSha = await resolveCommit(config.root, options);

  const doFetch = options.fetch ?? fetch;
  const url = new URL('api/tokens', base.href.endsWith('/') ? base : `${base.href}/`);
  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ commitSha, sources: loaded.sources }),
    });
  } catch (error) {
    throw new PublishTokensError([`não foi possível conectar a ${base.origin}: ${(error as Error).message}`]);
  }

  const body = (await response.json().catch(() => null)) as {
    modes?: string[];
    tokens?: number;
    warnings?: ServerDiagnostic[];
    diagnostics?: ServerDiagnostic[];
    error?: string;
  } | null;

  if (response.status === 201 && body) {
    // Os avisos locais e os da instância são os mesmos (mesmo parser); mostra uma vez.
    const warnings = [...new Set([...loaded.warnings, ...(body.warnings ?? []).map(format)])];
    return { commitSha, modes: body.modes ?? [], tokens: body.tokens ?? 0, warnings };
  }
  if (response.status === 401) {
    throw new PublishTokensError(['a instância recusou o token (ausente, inválido ou revogado) — gere um token de escopo "Design tokens upload" em Settings → Upload tokens.']);
  }
  if (response.status === 403) {
    throw new PublishTokensError(['o token é de outro escopo — esta publicação exige um token de escopo "Design tokens upload" (Settings → Upload tokens).']);
  }
  if (response.status === 404) {
    throw new PublishTokensError([`${base.href} não tem a publicação de tokens — confira a URL e atualize a instância para uma versão com tokens.`]);
  }
  if (response.status === 413) {
    throw new PublishTokensError(['os arquivos de tokens são maiores do que a instância (ou o proxy na frente dela) aceita.']);
  }
  if (response.status === 422 && body?.diagnostics?.length) {
    throw new PublishTokensError([...body.diagnostics.map(format), 'a instância recusou os tokens; nada foi publicado.']);
  }
  throw new PublishTokensError([
    body?.error ? `a instância recusou os tokens: ${body.error}` : `a instância respondeu HTTP ${response.status} à publicação de tokens.`,
  ]);
}
