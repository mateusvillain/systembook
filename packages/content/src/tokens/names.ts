import { sortByTokenOrder, TokenDiagnosticBag, type TokenDiagnostic } from './diagnostics.js';
import { ROOT_TOKEN } from './types.js';

/**
 * Nomes de um token para quem vai usá-lo (SYS-127): a variável CSS e o acesso
 * em JS que os botões de copiar da doc mostram, e o nome que o preview injeta.
 * Um lugar só para as regras, para os dois nunca divergirem.
 *
 * O caminho (`color.brand.500`) é o próprio `Token.path`.
 */

/**
 * Um segmento na variável CSS. Fora do ASCII tudo é válido num nome CSS sem
 * escape (acentos, emoji), então só a pontuação ASCII vira `-`. Um segmento só
 * de pontuação (`@@`) não some — vira os códigos dos caracteres (`40-40`), ou
 * colidiria com o vizinho.
 */
function cssSegment(segment: string): string {
  const name = segment
    .normalize('NFC')
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1-$2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u{80}-\u{10ffff}]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return name || [...segment].map((c) => c.codePointAt(0)!.toString(16)).join('-');
}

/**
 * Variável CSS do token, na convenção do Style Dictionary: segmentos em
 * kebab-case, minúsculos, unidos por `-`. `color.brandPrimary.500` →
 * `--color-brand-primary-500`; `accent.$root` → `--accent`.
 */
export function toCssVar(path: string): string {
  const segments = path.split('.').filter((s) => s !== ROOT_TOKEN);
  return `--${segments.map(cssSegment).join('-')}`;
}

const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u;
/** Índice que o JS lê como o mesmo número: sem zero à esquerda e dentro do inteiro seguro. */
const INDEX = /^(?:0|[1-9]\d{0,14})$/;
const RESERVED = new Set(
  `await break case catch class const continue debugger default delete do else enum export extends false finally
  for function if import in instanceof let new null return static super switch this throw true try typeof var void
  while with yield`.split(/\s+/),
);
/** Raiz quando o primeiro segmento não pode abrir a expressão sozinho (`2xl`, `default`). */
const ROOT = 'tokens';

/**
 * Acesso ao token num objeto JS aninhado com os mesmos grupos:
 * `color.brand.500` → `color.brand[500]`; `space.2xl` → `space["2xl"]`. Se o
 * primeiro segmento não abre uma expressão (`2xl.gap`, `default.x`), ela parte
 * de `tokens`: `tokens["2xl"].gap`.
 */
export function toJsPath(path: string): string {
  const segments = path.split('.');
  const accessors = segments.map((segment) => {
    if (IDENTIFIER.test(segment)) return `.${segment}`;
    if (INDEX.test(segment)) return `[${segment}]`;
    return `[${JSON.stringify(segment)}]`;
  });
  const first = segments[0]!;
  if (IDENTIFIER.test(first) && !RESERVED.has(first)) return `${first}${accessors.slice(1).join('')}`;
  return `${ROOT}${accessors.join('')}`;
}

/** Variáveis CSS geradas por mais de um token — no preview, uma sobrescreveria a outra. */
export function findCssVarCollisions(paths: readonly string[]): Map<string, string[]> {
  const byVar = new Map<string, string[]>();
  for (const path of paths) {
    const name = toCssVar(path);
    byVar.set(name, [...(byVar.get(name) ?? []), path]);
  }
  return new Map([...byVar].filter(([, list]) => list.length > 1));
}

/** Aviso em cada token que repete a variável CSS de um anterior, na ordem dos tokens. */
export function checkCssVarCollisions(tokens: readonly { path: string; file: string }[]): TokenDiagnostic[] {
  const bag = new TokenDiagnosticBag();
  const paths = tokens.map((t) => t.path);
  const files = new Map(tokens.map((t) => [t.path, t.file]));
  for (const [name, [first, ...others]] of findCssVarCollisions(paths)) {
    for (const path of others) {
      bag.warning(files.get(path)!, path, `gera a mesma variável CSS de ${first} (${name}); renomeie um dos dois.`);
    }
  }
  return sortByTokenOrder(bag.items, paths);
}
