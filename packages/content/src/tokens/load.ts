import { TokenDiagnosticBag } from './diagnostics.js';
import { findCssVarCollisions } from './names.js';
import { parseTokenSources } from './parse.js';
import { resolveTokens } from './resolve.js';
import type { LoadedTokens, TokenSource } from './types.js';
import { validateTokens } from './validate.js';

/**
 * Arquivos DTCG → `TokenSet`: parse, resolução de aliases e validação. É o
 * que o build, o `systembook check` e o upload para o CMS chamam. Com algum
 * diagnóstico `error`, o conjunto sai sem os tokens afetados — quem chama
 * decide se isso falha (o build falha).
 */
export function loadTokenSet(sources: readonly TokenSource[]): LoadedTokens {
  const parsed = parseTokenSources(sources);
  const resolved = resolveTokens(parsed);
  const validated = validateTokens(resolved.tokens, parsed.modes);

  // Dois tokens com a mesma variável CSS (`brandPrimary` e `brand-primary`):
  // no preview, a última sobrescreveria a primeira.
  const files = new Map(resolved.tokens.map((t) => [t.path, t.file]));
  const collisions = new TokenDiagnosticBag();
  for (const [name, [first, ...others]] of findCssVarCollisions(validated.tokens.map((t) => t.path))) {
    for (const path of others) {
      collisions.warning(files.get(path)!, path, `gera a mesma variável CSS de ${first} (${name}); renomeie um dos dois.`);
    }
  }

  return {
    set: { modes: parsed.modes, tokens: validated.tokens },
    diagnostics: [...parsed.diagnostics, ...resolved.diagnostics, ...validated.diagnostics, ...collisions.items],
  };
}
