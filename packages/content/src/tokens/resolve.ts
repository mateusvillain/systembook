import type { TokenModeValue, TokenValue } from '@systembook/schema';
import { didYouMean } from '../diagnostics.js';
import { TokenDiagnosticBag } from './diagnostics.js';
import type { ParsedToken, ParsedTokens, ResolvedToken, ResolvedTokens } from './types.js';

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
/**
 * Cadeia de aliases mais longa aceita. A resolução é recursiva: sem limite,
 * uma cadeia de milhares de tokens estouraria a pilha em vez de virar erro.
 */
const MAX_ALIAS_DEPTH = 256;

/** Caminho apontado quando o valor inteiro é um alias. */
export function aliasTarget(value: TokenValue): string | undefined {
  return typeof value === 'string' ? ALIAS.exec(value)?.[1] : undefined;
}

/** O alias do token no modo, quando o valor inteiro é um. */
function directAlias(token: ParsedToken, mode: string): string | undefined {
  return aliasTarget(token.byMode[mode]!);
}

type Resolution = { ok: true; value: TokenValue } | { ok: false };

const FAILED: Resolution = { ok: false };

/** Estado compartilhado pelas etapas da resolução. */
class Resolver {
  readonly bag = new TokenDiagnosticBag();
  readonly index: Map<string, ParsedToken>;
  readonly paths: string[];
  /** Tokens com erro: um diagnóstico por token, mesmo que falhe em vários modos. */
  readonly failed = new Set<string>();
  /** Tokens que o parser já descartou, com erro próprio. */
  readonly dropped: Set<string>;
  /** Aliases de cada token, inclusive dentro de valores compostos, em qualquer modo. */
  readonly refs = new Map<string, Set<string>>();
  /** Valor resolvido de cada token, por modo. */
  readonly resolved = new Map<string, Map<string, Resolution>>();

  constructor(readonly parsed: ParsedTokens) {
    this.index = new Map(parsed.tokens.map((t) => [t.path, t]));
    this.paths = [...this.index.keys()];
    this.dropped = new Set(
      parsed.diagnostics.flatMap((d) => (d.severity === 'error' && d.path !== undefined ? [d.path] : [])),
    );
    for (const token of parsed.tokens) this.refs.set(token.path, new Set());
  }

  fail(token: ParsedToken, message: string): void {
    if (this.failed.has(token.path)) return;
    this.failed.add(token.path);
    this.bag.error(token.file, token.path, message);
  }

  /** Por que o alias não tem para onde apontar. */
  missingTarget(ref: string, from: string): string {
    if (this.dropped.has(ref)) return `o alias {${ref}} aponta para um token com erro`;
    if (this.paths.some((p) => p.startsWith(`${ref}.`))) return `o alias {${ref}} aponta para um grupo, não para um token`;
    // Apontar para si mesmo nunca é a correção.
    const candidates = this.paths.filter((p) => p !== from);
    return `o alias {${ref}} aponta para um token que não existe${didYouMean(ref, candidates)}`;
  }
}

export function resolveTokens(parsed: ParsedTokens): ResolvedTokens {
  const r = new Resolver(parsed);
  for (const mode of parsed.modes) resolveMode(r, mode);
  const types = inferTypes(r);
  cascadeFailures(r);

  const tokens: ResolvedToken[] = [];
  for (const token of parsed.tokens) {
    if (r.failed.has(token.path)) continue;
    const byMode: Record<string, TokenModeValue> = {};
    for (const mode of parsed.modes) {
      const resolution = r.resolved.get(token.path)!.get(mode)!;
      // Token fora de `failed` resolveu em todos os modos.
      if (!resolution.ok) throw new Error(`token ${token.path} sem valor resolvido no modo ${mode}`);
      // Cópias: um alias não pode dividir o objeto com o token apontado (nem
      // com a entrada), ou mexer num mudaria o outro.
      const entry: TokenModeValue = {
        value: structuredClone(token.byMode[mode]!),
        resolvedValue: structuredClone(resolution.value),
      };
      const ref = directAlias(token, mode);
      if (ref !== undefined) entry.aliasOf = ref;
      byMode[mode] = entry;
    }
    const result: ResolvedToken = { ...token, byMode };
    const type = types.get(token.path);
    if (type !== undefined) result.type = type;
    tokens.push(result);
  }

  // Na ordem dos tokens nos arquivos, não na ordem em que a resolução os achou.
  const order = new Map(parsed.tokens.map((t, i) => [t.path, i]));
  const diagnostics = [...r.bag.items].sort((a, b) => order.get(a.path!)! - order.get(b.path!)!);
  return { tokens, diagnostics };
}

/** Resolve os aliases de todos os tokens num modo. */
function resolveMode(r: Resolver, mode: string): void {
  const inMode = r.parsed.modes.length > 1 ? ` (modo ${mode})` : '';
  /** Tokens sendo resolvidos agora, para achar referências circulares. */
  const stack: string[] = [];

  const resolveToken = (path: string): Resolution => {
    const done = r.resolved.get(path)?.get(mode);
    if (done) return done;
    const at = stack.indexOf(path);
    if (at >= 0) {
      const cycle = stack.slice(at);
      cycle.forEach((member, i) => {
        const chain = [...cycle.slice(i), ...cycle.slice(0, i), member];
        r.fail(r.index.get(member)!, `referência circular: ${chain.join(' → ')}${inMode}.`);
      });
      return FAILED;
    }
    const token = r.index.get(path)!;
    if (stack.length >= MAX_ALIAS_DEPTH) {
      r.fail(token, `cadeia de aliases com mais de ${MAX_ALIAS_DEPTH} tokens${inMode}.`);
      return FAILED;
    }
    stack.push(path);
    const resolution = resolveValue(token.byMode[mode]!, token);
    stack.pop();
    let byMode = r.resolved.get(path);
    if (!byMode) r.resolved.set(path, (byMode = new Map()));
    byMode.set(mode, resolution);
    return resolution;
  };

  const resolveValue = (value: TokenValue, token: ParsedToken): Resolution => {
    const ref = aliasTarget(value);
    if (ref !== undefined) {
      r.refs.get(token.path)!.add(ref);
      if (!r.index.has(ref)) {
        r.fail(token, `${r.missingTarget(ref, token.path)}${inMode}.`);
        return FAILED;
      }
      const target = resolveToken(ref);
      if (!target.ok) r.fail(token, `o alias {${ref}} aponta para um token com erro${inMode}.`);
      return target;
    }
    if (Array.isArray(value)) {
      const items: TokenValue[] = [];
      for (const item of value) {
        const resolution = resolveValue(item, token);
        if (!resolution.ok) return resolution;
        items.push(resolution.value);
      }
      return { ok: true, value: items };
    }
    if (value !== null && typeof value === 'object') {
      const entries: [string, TokenValue][] = [];
      for (const [key, item] of Object.entries(value)) {
        const resolution = resolveValue(item, token);
        if (!resolution.ok) return resolution;
        entries.push([key, resolution.value]);
      }
      // fromEntries, não atribuição: uma chave "__proto__" do JSON tem de
      // continuar chave, não virar o protótipo do objeto.
      return { ok: true, value: Object.fromEntries(entries) };
    }
    return { ok: true, value };
  };

  for (const token of r.parsed.tokens) resolveToken(token.path);
}

/**
 * Tipo de cada token: o declarado, que precisa ser o mesmo do token apontado;
 * sem declarado, o dos tokens apontados (seguindo a cadeia), que têm de
 * concordar entre os modos.
 */
function inferTypes(r: Resolver): Map<string, string> {
  const { modes } = r.parsed;
  const typeOf = (path: string, seen = new Set<string>()): string | undefined => {
    const token = r.index.get(path)!;
    if (token.type !== undefined || seen.has(path)) return token.type;
    seen.add(path);
    for (const mode of modes) {
      const ref = directAlias(token, mode);
      if (ref !== undefined && r.index.has(ref)) return typeOf(ref, seen);
    }
    return undefined;
  };

  const types = new Map<string, string>();
  for (const token of r.parsed.tokens) {
    if (r.failed.has(token.path)) continue;
    const aliasTypes = new Map<string, string>();
    for (const mode of modes) {
      const ref = directAlias(token, mode);
      const type = ref === undefined ? undefined : typeOf(ref);
      if (type !== undefined) aliasTypes.set(ref!, type);
    }
    if (token.type !== undefined) {
      const mismatch = [...aliasTypes].find(([, type]) => type !== token.type);
      if (mismatch) r.fail(token, `"$type" é ${token.type}, mas o alias {${mismatch[0]}} aponta para um token ${mismatch[1]}.`);
      else types.set(token.path, token.type);
      continue;
    }
    const targetTypes = [...new Set(aliasTypes.values())];
    if (targetTypes.length > 1) {
      r.fail(token, `os aliases apontam para tokens de tipos diferentes (${targetTypes.join(', ')}); declare o "$type".`);
    } else if (targetTypes[0] !== undefined) {
      types.set(token.path, targetTypes[0]);
    }
  }
  return types;
}

/**
 * Quem aponta (mesmo num campo de valor composto) para um token com erro cai
 * junto, até nada mais mudar: o conjunto não pode ter alias para fora dele.
 */
function cascadeFailures(r: Resolver): void {
  for (let changed = true; changed; ) {
    changed = false;
    for (const token of r.parsed.tokens) {
      if (r.failed.has(token.path)) continue;
      const broken = [...r.refs.get(token.path)!].find((ref) => r.failed.has(ref));
      if (broken !== undefined) {
        r.fail(token, `o alias {${broken}} aponta para um token com erro.`);
        changed = true;
      }
    }
  }
}
