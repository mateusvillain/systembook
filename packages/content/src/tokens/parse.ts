import type { TokenValue } from '@systembook/schema';
import { TokenDiagnosticBag } from './diagnostics.js';
import { DEFAULT_TOKEN_MODE, type ParsedToken, type ParsedTokens, type TokenSource } from './types.js';

/**
 * Parser de arquivos DTCG (SYS-124): achata grupos aninhados em tokens com
 * `path`, mescla os arquivos — os grupos de mesmo caminho são um grupo só, e o
 * `$type`/`$deprecated` de um vale para os tokens dele em qualquer arquivo — e
 * sobrepõe os arquivos de modo aos base. Não resolve aliases nem valida
 * valores: o resolvedor e o validador recebem a saída daqui.
 */

const TOKEN_PROPS = new Set(['$value', '$type', '$description', '$deprecated', '$extensions']);
const GROUP_PROPS = new Set(['$type', '$description', '$deprecated', '$extensions']);
/** `$schema` só faz sentido no topo do arquivo. */
const FILE_PROPS = new Set([...GROUP_PROPS, '$schema']);
/** Token com o valor do próprio grupo (spec 2025.10): `{color.accent.$root}`. */
const ROOT_TOKEN = '$root';
const INVALID_NAME = /[.{}]/;
/** Viraria o protótipo do `byMode`, não uma chave dele. */
const RESERVED_MODES = new Set(['__proto__']);

type JsonObject = { [key: string]: TokenValue };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDeprecated(value: unknown): value is boolean | string {
  return typeof value === 'boolean' || typeof value === 'string';
}

/** O que um token ou grupo declara num arquivo, sem herança. */
interface Declared {
  file: string;
  type?: string;
  deprecated?: boolean | string;
}

/** Uma definição do token num arquivo. `mode` ausente = arquivo base. */
interface TokenDefinition extends Declared {
  mode?: string;
  value: TokenValue;
  description?: string;
}

/** Definições por caminho, na ordem dos arquivos. */
type Definitions<T> = Map<string, T[]>;

function append<T>(map: Definitions<T>, path: string, item: T) {
  const list = map.get(path);
  if (list) list.push(item);
  else map.set(path, [item]);
}

/** Última definição que satisfaz `match`, na ordem dos arquivos. */
function lastWhere<T>(items: readonly T[], match: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (match(items[i]!)) return items[i];
  }
  return undefined;
}

/** Último valor definido de um campo, na ordem dos arquivos. */
function last<T, K extends keyof T>(items: readonly T[], key: K): T[K] | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]![key] !== undefined) return items[i]![key];
  }
  return undefined;
}

/** Lê os arquivos na ordem dada: numa redefinição, vale a última. */
export function parseTokenSources(sources: readonly TokenSource[]): ParsedTokens {
  const bag = new TokenDiagnosticBag();
  const tokens: Definitions<TokenDefinition> = new Map();
  const groups: Definitions<Declared> = new Map();
  const modes: string[] = [];

  for (const source of sources) {
    const { file, mode } = source;
    if (mode !== undefined && (!mode.trim() || RESERVED_MODES.has(mode))) {
      bag.error(file, undefined, `nome de modo inválido: "${mode}".`);
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(source.content);
    } catch (err) {
      bag.error(file, undefined, `JSON inválido: ${(err as Error).message}`);
      continue;
    }
    if (!isObject(json) || '$value' in json) {
      bag.error(file, undefined, 'o arquivo deve ser um objeto com grupos e tokens.');
      continue;
    }
    // O modo só conta depois de o arquivo abrir: um JSON quebrado já é um
    // erro, e não precisa virar também "sem valor no modo" em cada token.
    if (mode !== undefined && !modes.includes(mode)) modes.push(mode);

    /** `$type`/`$deprecated`/`$description` válidos; os inválidos avisam e somem. */
    const readDeclared = (node: JsonObject, path: string | undefined, label: string) => {
      const declared: Declared & { description?: string } = { file };
      if (typeof node.$type === 'string') declared.type = node.$type;
      else if ('$type' in node) bag.warning(file, path, `"$type" ${label}deve ser um texto; ignorado.`);
      if (isDeprecated(node.$deprecated)) declared.deprecated = node.$deprecated;
      else if ('$deprecated' in node) bag.warning(file, path, `"$deprecated" ${label}deve ser true/false ou um texto; ignorado.`);
      if (typeof node.$description === 'string') declared.description = node.$description;
      else if ('$description' in node) bag.warning(file, path, `"$description" ${label}deve ser um texto; ignorado.`);
      return declared;
    };

    const readToken = (node: JsonObject, path: string) => {
      for (const key of Object.keys(node)) {
        if (!key.startsWith('$')) {
          bag.warning(file, path, `"${key}" ignorado: um token não pode conter outros tokens ou grupos.`);
        } else if (!TOKEN_PROPS.has(key)) {
          bag.warning(file, path, `propriedade "${key}" não suportada; ignorada.`);
        }
      }
      if (node.$value === null) {
        bag.error(file, path, '"$value" está vazio.');
        return;
      }
      if ('$type' in node && typeof node.$type !== 'string') {
        bag.error(file, path, '"$type" deve ser um texto.');
        return;
      }
      const previous = lastWhere(tokens.get(path) ?? [], (d) => d.mode === mode);
      if (previous) bag.warning(file, path, `token redefinido (já estava em ${previous.file}); vale esta definição.`);
      const def: TokenDefinition = { ...readDeclared(node, path, ''), value: node.$value! };
      if (mode !== undefined) def.mode = mode;
      append(tokens, path, def);
    };

    const walkGroup = (node: JsonObject, segments: string[]) => {
      const path = segments.join('.');
      /** A raiz do arquivo não tem caminho nos diagnósticos. */
      const where = path || undefined;
      const allowed = segments.length ? GROUP_PROPS : FILE_PROPS;
      for (const key of Object.keys(node)) {
        if (key.startsWith('$') && key !== ROOT_TOKEN && !allowed.has(key)) {
          bag.warning(file, where, `propriedade "${key}" não suportada em grupo; ignorada.`);
        }
      }
      const { type, deprecated } = readDeclared(node, where, 'do grupo ');
      if (type !== undefined || deprecated !== undefined) {
        const declared: Declared = { file };
        if (type !== undefined) declared.type = type;
        if (deprecated !== undefined) declared.deprecated = deprecated;
        append(groups, path, declared);
      }

      for (const [key, child] of Object.entries(node)) {
        if (key.startsWith('$') && key !== ROOT_TOKEN) continue;
        if (!key || INVALID_NAME.test(key)) {
          bag.error(file, where, `nome "${key}" inválido: nomes não podem ser vazios nem ter ".", "{" ou "}".`);
          continue;
        }
        const childSegments = [...segments, key];
        const childPath = childSegments.join('.');
        if (key === ROOT_TOKEN && !segments.length) {
          bag.error(file, childPath, '"$root" só existe dentro de um grupo.');
        } else if (!isObject(child)) {
          bag.error(file, childPath, 'não é token nem grupo — um token precisa de "$value".');
        } else if ('$value' in child) {
          readToken(child, childPath);
        } else if (key === ROOT_TOKEN) {
          bag.error(file, childPath, '"$root" precisa ser um token, com "$value".');
        } else {
          walkGroup(child, childSegments);
        }
      }
    };

    walkGroup(json, []);
  }

  const allModes = modes.length ? modes : [DEFAULT_TOKEN_MODE];
  return { modes: allModes, tokens: mergeDefinitions(tokens, groups, allModes, bag), diagnostics: bag.items };
}

/**
 * Junta as definições de cada caminho num token: herança de grupo, valor de
 * cada modo (o do arquivo do modo, senão o do base) e os campos do token.
 */
function mergeDefinitions(
  tokens: Definitions<TokenDefinition>,
  groups: Definitions<Declared>,
  modes: readonly string[],
  bag: TokenDiagnosticBag,
): ParsedToken[] {
  const groupType = new Map<string, string>();
  const groupDeprecated = new Map<string, boolean | string>();
  for (const [path, declared] of groups) {
    const types = [...new Set(declared.flatMap((d) => (d.type === undefined ? [] : [d.type])))];
    if (types.length > 1) {
      bag.warning(declared.at(-1)!.file, path || undefined, `"$type" do grupo diferente entre os arquivos (${types.join(', ')}); vale o último.`);
    }
    const type = last(declared, 'type');
    if (type !== undefined) groupType.set(path, type);
    const deprecated = last(declared, 'deprecated');
    if (deprecated !== undefined) groupDeprecated.set(path, deprecated);
  }
  /** O valor do grupo mais próximo que declara, subindo até a raiz do arquivo (`""`). */
  const inherited = <T>(map: Map<string, T>, path: string): T | undefined => {
    const segments = path.split('.');
    for (let i = segments.length - 1; i >= 0; i--) {
      const value = map.get(segments.slice(0, i).join('.'));
      if (value !== undefined) return value;
    }
    return undefined;
  };

  // Um caminho não pode ser token num arquivo e grupo em outro: fica de fora
  // o token e tudo o que está dentro dele.
  const conflicted = new Set<string>();
  for (const path of tokens.keys()) {
    const segments = path.split('.');
    for (let i = 1; i < segments.length; i++) {
      const prefix = segments.slice(0, i).join('.');
      const defs = tokens.get(prefix);
      if (!defs) continue;
      if (!conflicted.has(prefix)) {
        bag.error(defs[0]!.file, prefix, `é token e grupo ao mesmo tempo (${path} está dentro dele).`);
      }
      conflicted.add(prefix).add(path);
    }
  }
  for (const [path, declared] of groups) {
    const defs = tokens.get(path);
    if (defs && !conflicted.has(path)) {
      bag.error(defs[0]!.file, path, `é token e grupo ao mesmo tempo (declarado como grupo em ${declared[0]!.file}).`);
      conflicted.add(path);
    }
  }

  const result: ParsedToken[] = [];
  for (const [path, defs] of tokens) {
    if (conflicted.has(path)) continue;
    const typed = defs.filter((d) => d.type !== undefined);
    const divergent = typed.find((d) => d.type !== typed[0]!.type);
    if (divergent) {
      const types = [...new Set(typed.map((d) => d.type))];
      bag.error(divergent.file, path, `"$type" diferente entre os arquivos: ${types.join(', ')}.`);
      continue;
    }
    const byMode: Record<string, TokenValue> = {};
    const missing: string[] = [];
    for (const mode of modes) {
      const def = lastWhere(defs, (d) => d.mode === mode) ?? lastWhere(defs, (d) => d.mode === undefined);
      if (def) byMode[mode] = def.value;
      else missing.push(mode);
    }
    if (missing.length) {
      bag.error(defs[0]!.file, path, `sem valor no modo ${missing.join(', ')} — defina o token num arquivo base ou em todos os modos.`);
      continue;
    }
    const token: ParsedToken = { path, byMode, file: defs[0]!.file };
    const type = typed[0]?.type ?? inherited(groupType, path);
    if (type !== undefined) token.type = type;
    const description = last(defs, 'description');
    if (description !== undefined) token.description = description;
    const deprecated = last(defs, 'deprecated') ?? inherited(groupDeprecated, path);
    if (deprecated !== undefined) token.deprecated = deprecated;
    result.push(token);
  }
  return result;
}
