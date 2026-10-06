/**
 * Nomes de um token para quem vai usá-lo (SYS-127): a variável CSS e o acesso
 * em JS que os botões de copiar da doc mostram, e o nome que o preview injeta.
 * Um lugar só para as regras, para os dois nunca divergirem.
 *
 * O caminho (`color.brand.500`) é o próprio `Token.path`.
 */

/** O token do próprio grupo (`accent.$root`) é o grupo na variável CSS: `--accent`. */
const ROOT_TOKEN = '$root';

/** `brandPrimary` → `brand-primary`; `HTMLColor` → `html-color`. */
function kebab(segment: string): string {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export interface CssVarOptions {
  /** Prefixo do design system: `ds` → `--ds-color-brand-500`. */
  prefix?: string;
}

/**
 * Variável CSS do token, na convenção do Style Dictionary: segmentos em
 * kebab-case, minúsculos, unidos por `-`. `color.brandPrimary.500` →
 * `--color-brand-primary-500`.
 */
export function toCssVar(path: string, options: CssVarOptions = {}): string {
  const segments = path.split('.').filter((s) => s !== ROOT_TOKEN);
  if (options.prefix) segments.unshift(options.prefix);
  return `--${segments.map(kebab).filter(Boolean).join('-')}`;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const INDEX = /^(?:0|[1-9]\d*)$/;
/** Raiz quando o primeiro segmento não pode abrir a expressão sozinho (`2xl`). */
const DEFAULT_ROOT = 'tokens';

/**
 * Acesso ao token num objeto JS aninhado com os mesmos grupos:
 * `color.brand.500` → `color.brand[500]`; `space.2xl` → `space["2xl"]`.
 * Com `root`, a expressão parte dele: `tokens.color.brand[500]`.
 */
export function toJsPath(path: string, root?: string): string {
  const accessors = path.split('.').map((segment) => {
    if (IDENTIFIER.test(segment)) return `.${segment}`;
    if (INDEX.test(segment)) return `[${segment}]`;
    return `[${JSON.stringify(segment)}]`;
  });
  const [first, ...rest] = accessors;
  if (root === undefined && first!.startsWith('.')) return `${first!.slice(1)}${rest.join('')}`;
  return `${root ?? DEFAULT_ROOT}${accessors.join('')}`;
}

/** Variáveis CSS geradas por mais de um token — no preview, uma sobrescreveria a outra. */
export function findCssVarCollisions(paths: readonly string[], options: CssVarOptions = {}): Map<string, string[]> {
  const byVar = new Map<string, string[]>();
  for (const path of paths) {
    const name = toCssVar(path, options);
    byVar.set(name, [...(byVar.get(name) ?? []), path]);
  }
  return new Map([...byVar].filter(([, list]) => list.length > 1));
}
