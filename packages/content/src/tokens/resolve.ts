import type { TokenModeValue, TokenValue } from '@systembook/schema';
import { didYouMean } from '../diagnostics.js';
import { TokenDiagnosticBag, type TokenDiagnostic } from './diagnostics.js';
import type { ParsedToken, ResolvedToken } from './types.js';

/**
 * Resolução de aliases (SYS-125). Um alias é um texto `{caminho.do.token}` no
 * valor inteiro ou num campo de um valor composto; ele é resolvido dentro do
 * modo — no modo `dark`, `{color.bg}` vale o `color.bg` do `dark`. Um token
 * sem `$type` herda o do token apontado.
 *
 * Token com alias quebrado, referência circular ou tipo incompatível fica de
 * fora (com diagnóstico), e quem aponta para ele também.
 */

const ALIAS = /^\{([^{}]+)\}$/;

/** Caminho apontado quando o valor inteiro é um alias. */
export function aliasTarget(value: TokenValue): string | undefined {
  return typeof value === 'string' ? ALIAS.exec(value)?.[1] : undefined;
}

/** Todos os caminhos apontados no valor, inclusive em campos de valores compostos. */
function aliasesIn(value: TokenValue): string[] {
  const ref = aliasTarget(value);
  if (ref !== undefined) return [ref];
  if (Array.isArray(value)) return value.flatMap(aliasesIn);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(aliasesIn);
  return [];
}

type Outcome = { ok: true; value: TokenValue } | { ok: false };

const FAILED: Outcome = { ok: false };

export interface ResolvedTokens {
  tokens: ResolvedToken[];
  diagnostics: TokenDiagnostic[];
}

export function resolveTokens(tokens: readonly ParsedToken[], modes: readonly string[]): ResolvedTokens {
  const bag = new TokenDiagnosticBag();
  const index = new Map(tokens.map((t) => [t.path, t]));
  const paths = [...index.keys()];
  /** Tokens com erro: um diagnóstico por token, mesmo que falhe em vários modos. */
  const failed = new Set<string>();
  const fail = (token: ParsedToken, message: string) => {
    if (failed.has(token.path)) return;
    failed.add(token.path);
    bag.error(token.file, token.path, message);
  };

  /** Sugestão entre os outros tokens — apontar para si mesmo nunca é a correção. */
  const missingTarget = (ref: string, from: string) =>
    paths.some((p) => p.startsWith(`${ref}.`))
      ? `o alias {${ref}} aponta para um grupo, não para um token`
      : `o alias {${ref}} aponta para um token que não existe${didYouMean(ref, paths.filter((p) => p !== from))}`;

  const resolvedByMode = new Map<string, Map<string, Outcome>>();
  for (const mode of modes) {
    const inMode = modes.length > 1 ? ` (modo ${mode})` : '';
    const memo = new Map<string, Outcome>();
    /** Tokens sendo resolvidos agora, para achar referências circulares. */
    const stack: string[] = [];

    const resolveToken = (path: string): Outcome => {
      const done = memo.get(path);
      if (done) return done;
      const at = stack.indexOf(path);
      if (at >= 0) {
        const cycle = stack.slice(at);
        cycle.forEach((member, i) => {
          const chain = [...cycle.slice(i), ...cycle.slice(0, i), member];
          fail(index.get(member)!, `referência circular: ${chain.join(' → ')}${inMode}.`);
        });
        return FAILED;
      }
      const token = index.get(path)!;
      stack.push(path);
      const outcome = resolveValue(token.byMode[mode]!, token);
      stack.pop();
      memo.set(path, outcome);
      return outcome;
    };

    const resolveValue = (value: TokenValue, token: ParsedToken): Outcome => {
      const ref = aliasTarget(value);
      if (ref !== undefined) {
        if (!index.has(ref)) {
          fail(token, `${missingTarget(ref, token.path)}${inMode}.`);
          return FAILED;
        }
        const target = resolveToken(ref);
        if (!target.ok) fail(token, `o alias {${ref}} aponta para um token com erro${inMode}.`);
        return target;
      }
      if (Array.isArray(value)) {
        const items: TokenValue[] = [];
        for (const item of value) {
          const outcome = resolveValue(item, token);
          if (!outcome.ok) return outcome;
          items.push(outcome.value);
        }
        return { ok: true, value: items };
      }
      if (value !== null && typeof value === 'object') {
        const entries: [string, TokenValue][] = [];
        for (const [key, item] of Object.entries(value)) {
          const outcome = resolveValue(item, token);
          if (!outcome.ok) return outcome;
          entries.push([key, outcome.value]);
        }
        // fromEntries, não atribuição: uma chave "__proto__" do JSON tem de
        // continuar chave, não virar o protótipo do objeto.
        return { ok: true, value: Object.fromEntries(entries) };
      }
      return { ok: true, value };
    };

    for (const token of tokens) resolveToken(token.path);
    resolvedByMode.set(mode, memo);
  }

  // Tipo: o declarado, senão o do token apontado (seguindo a cadeia).
  const typeOf = (path: string, seen = new Set<string>()): string | undefined => {
    const token = index.get(path)!;
    if (token.type !== undefined || seen.has(path)) return token.type;
    seen.add(path);
    for (const mode of modes) {
      const ref = aliasTarget(token.byMode[mode]!);
      if (ref !== undefined && index.has(ref)) return typeOf(ref, seen);
    }
    return undefined;
  };

  // Tipo do alias: um token tipado precisa apontar para o mesmo tipo; um sem
  // tipo herda o dos tokens apontados, que têm de concordar entre os modos.
  const types = new Map<string, string>();
  for (const token of tokens) {
    if (failed.has(token.path)) continue;
    const aliasTypes = new Map<string, string>();
    for (const mode of modes) {
      const ref = aliasTarget(token.byMode[mode]!);
      const type = ref === undefined ? undefined : typeOf(ref);
      if (type !== undefined) aliasTypes.set(ref!, type);
    }
    if (token.type !== undefined) {
      const mismatch = [...aliasTypes].find(([, type]) => type !== token.type);
      if (mismatch) fail(token, `"$type" é ${token.type}, mas o alias {${mismatch[0]}} aponta para um token ${mismatch[1]}.`);
      else types.set(token.path, token.type);
      continue;
    }
    const targetTypes = [...new Set(aliasTypes.values())];
    if (targetTypes.length > 1) {
      fail(token, `os aliases apontam para tokens de tipos diferentes (${targetTypes.join(', ')}); declare o "$type".`);
    } else if (targetTypes[0] !== undefined) {
      types.set(token.path, targetTypes[0]);
    }
  }

  // Quem aponta (mesmo num campo de valor composto) para um token que caiu na
  // checagem de tipo cai junto: o conjunto não pode ter alias para fora dele.
  const refs = new Map(tokens.map((t) => [t.path, modes.flatMap((m) => aliasesIn(t.byMode[m]!))]));
  for (let changed = true; changed; ) {
    changed = false;
    for (const token of tokens) {
      if (failed.has(token.path)) continue;
      const broken = refs.get(token.path)!.find((ref) => failed.has(ref));
      if (broken !== undefined) {
        fail(token, `o alias {${broken}} aponta para um token com erro.`);
        changed = true;
      }
    }
  }

  const result: ResolvedToken[] = [];
  for (const token of tokens) {
    if (failed.has(token.path)) continue;
    const byMode: Record<string, TokenModeValue> = {};
    for (const mode of modes) {
      const value = token.byMode[mode]!;
      const outcome = resolvedByMode.get(mode)!.get(token.path)!;
      // Token fora de `failed` resolveu em todos os modos.
      if (!outcome.ok) throw new Error(`token ${token.path} sem valor resolvido no modo ${mode}`);
      const entry: TokenModeValue = { value, resolvedValue: outcome.value };
      const ref = aliasTarget(value);
      if (ref !== undefined) entry.aliasOf = ref;
      byMode[mode] = entry;
    }
    const resolved: ResolvedToken = { ...token, byMode };
    const type = types.get(token.path);
    if (type !== undefined) resolved.type = type;
    result.push(resolved);
  }
  return { tokens: result, diagnostics: bag.items };
}
