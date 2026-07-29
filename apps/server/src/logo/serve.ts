import type { ServerResponse } from 'node:http';
import type { Db } from '../db/client.js';
import { readLogo, type LogoVariant } from '../db/settings.js';

/**
 * GET /api/logo/<light|dark>/<hash> (SYS-39) — serve o blob do logo guardado
 * na tabela `settings`. Fora do tRPC porque a resposta é binária e precisa ser
 * cacheável por URL; público, como a própria documentação.
 *
 * O hash no path é o do conteúdo, então cada URL é imutável: `immutable` de um
 * ano é seguro, e trocar o logo gera uma URL nova em vez de depender de
 * revalidação. Hash que não bate é 404 — a URL antiga morre junto com o logo
 * antigo, em vez de servir silenciosamente outra imagem.
 *
 * **SVG e XSS:** um SVG é um documento e pode conter `<script>`. Como `<img>`,
 * ele nunca executa script; mas navegar direto para esta URL o renderiza como
 * documento **na nossa origem**. Por isso a resposta trava tudo com uma CSP
 * `default-src 'none'` e `sandbox`, mais `nosniff` — o arquivo continua
 * servindo como imagem e deixa de ser um vetor.
 */
export const LOGO_URL_PREFIX = '/api/logo/';

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** Resolve `/api/logo/<variant>/<hash>`; `null` quando o path não é de logo. */
export function parseLogoPath(pathname: string): { variant: LogoVariant; hash: string } | null {
  if (!pathname.startsWith(LOGO_URL_PREFIX)) return null;
  const [variant, hash, ...rest] = pathname.slice(LOGO_URL_PREFIX.length).split('/');
  if (rest.length > 0 || !hash) return null;
  if (variant !== 'light' && variant !== 'dark') return null;
  return { variant, hash };
}

export function handleLogoRequest(
  res: ServerResponse,
  db: Db,
  target: { variant: LogoVariant; hash: string },
): void {
  const logo = readLogo(db, target.variant);
  if (!logo || logo.hash !== target.hash) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': logo.mime,
    'content-length': logo.bytes.length,
    'cache-control': IMMUTABLE_CACHE,
    'x-content-type-options': 'nosniff',
    // Neutraliza SVG hostil se a URL for aberta diretamente (ver doc acima).
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  res.end(logo.bytes);
}
