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
  return {
    set: { modes: parsed.modes, tokens: validated.tokens },
    diagnostics: [...parsed.diagnostics, ...resolved.diagnostics, ...validated.diagnostics],
  };
}
