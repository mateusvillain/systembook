import type { TokenValue } from '@systembook/schema';
import {
  DEFAULT_TOKEN_MODE,
  type ParsedToken,
  type TokenDiagnostic,
  type TokenSource,
} from './types.js';

/**
 * Parser de arquivos DTCG (SYS-124): achata grupos aninhados em tokens com
 * `path`, herda `$type`/`$deprecated` do grupo e sobrepõe os arquivos de modo
 * aos arquivos base. Não resolve aliases nem valida valores — o resolvedor e o
 * validador recebem a saída daqui.
 */

const TOKEN_PROPS = new Set(['$value', '$type', '$description', '$deprecated', '$extensions']);
const GROUP_PROPS = new Set(['$type', '$description', '$deprecated', '$extensions']);
/** `$schema` só faz sentido no topo do arquivo. */
const ROOT_PROPS = new Set([...GROUP_PROPS, '$schema']);
/** Token com o valor do próprio grupo (spec 2025.10): `{color.accent.$root}`. */
const ROOT_TOKEN = '$root';
const INVALID_NAME = /[.{}]/;

type JsonObject = { [key: string]: TokenValue };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDeprecated(value: unknown): value is boolean | string {
  return typeof value === 'boolean' || typeof value === 'string';
}

/** Herança de grupo para os tokens de dentro dele. */
interface Inherited {
  type?: string;
  deprecated?: boolean | string;
}

/** Uma definição do token num arquivo. */
interface Definition {
  file: string;
  value: TokenValue;
  type?: string;
  description?: string;
  deprecated?: boolean | string;
}

/** Todas as definições de um caminho: a dos arquivos base e a de cada modo. */
interface Entry {
  base?: Definition;
  byMode: Map<string, Definition>;
}

export interface ParsedTokens {
  /** Modos na ordem das fontes; `["default"]` sem arquivos de modo. */
  modes: string[];
  tokens: ParsedToken[];
  diagnostics: TokenDiagnostic[];
}

/** Lê os arquivos na ordem dada: numa redefinição, vale a última. */
export function parseTokenSources(sources: readonly TokenSource[]): ParsedTokens {
  const diagnostics: TokenDiagnostic[] = [];
  const entries = new Map<string, Entry>();
  const modes: string[] = [];

  for (const source of sources) {
    const { file, mode } = source;
    const report = (severity: TokenDiagnostic['severity'], path: string, message: string) =>
      diagnostics.push(path ? { severity, file, path, message } : { severity, file, message });

    if (mode !== undefined && !mode.trim()) {
      report('error', '', 'o nome do modo está vazio.');
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(source.content);
    } catch (err) {
      report('error', '', `JSON inválido: ${(err as Error).message}`);
      continue;
    }
    if (!isObject(json) || '$value' in json) {
      report('error', '', 'o arquivo deve ser um objeto com grupos e tokens.');
      continue;
    }
    // O modo só conta depois de o arquivo abrir: um JSON quebrado já é um
    // erro, e não precisa virar também "sem valor no modo" em cada token.
    if (mode !== undefined && !modes.includes(mode)) modes.push(mode);

    const define = (path: string, def: Definition) => {
      let entry = entries.get(path);
      if (!entry) entries.set(path, (entry = { byMode: new Map() }));
      const previous = mode === undefined ? entry.base : entry.byMode.get(mode);
      if (previous) {
        report('warning', path, `token redefinido (já estava em ${previous.file}); vale esta definição.`);
      }
      if (mode === undefined) entry.base = def;
      else entry.byMode.set(mode, def);
    };

    const readToken = (node: JsonObject, path: string, inherited: Inherited) => {
      for (const key of Object.keys(node)) {
        if (!key.startsWith('$')) {
          report('warning', path, `"${key}" ignorado: um token não pode conter outros tokens ou grupos.`);
        } else if (!TOKEN_PROPS.has(key)) {
          report('warning', path, `propriedade "${key}" não suportada; ignorada.`);
        }
      }
      const value = node.$value!;
      if (value === null) {
        report('error', path, '"$value" está vazio.');
        return;
      }
      let type = inherited.type;
      if ('$type' in node) {
        if (typeof node.$type !== 'string') {
          report('error', path, '"$type" deve ser um texto.');
          return;
        }
        type = node.$type;
      }
      const def: Definition = { file, value };
      if (type !== undefined) def.type = type;
      if (typeof node.$description === 'string') def.description = node.$description;
      else if ('$description' in node) report('warning', path, '"$description" deve ser um texto; ignorado.');
      if (isDeprecated(node.$deprecated)) def.deprecated = node.$deprecated;
      else if ('$deprecated' in node) report('warning', path, '"$deprecated" deve ser true/false ou um texto; ignorado.');
      else if (inherited.deprecated !== undefined) def.deprecated = inherited.deprecated;
      define(path, def);
    };

    const walkGroup = (node: JsonObject, segments: string[], inherited: Inherited) => {
      const path = segments.join('.');
      const allowed = segments.length ? GROUP_PROPS : ROOT_PROPS;
      const own: Inherited = { ...inherited };
      for (const key of Object.keys(node)) {
        if (key.startsWith('$') && key !== ROOT_TOKEN && !allowed.has(key)) {
          report('warning', path, `propriedade "${key}" não suportada em grupo; ignorada.`);
        }
      }
      if (typeof node.$type === 'string') own.type = node.$type;
      else if ('$type' in node) report('warning', path, '"$type" do grupo deve ser um texto; ignorado.');
      if (isDeprecated(node.$deprecated)) own.deprecated = node.$deprecated;
      else if ('$deprecated' in node) report('warning', path, '"$deprecated" do grupo deve ser true/false ou um texto; ignorado.');

      for (const [key, child] of Object.entries(node)) {
        if (key.startsWith('$') && key !== ROOT_TOKEN) continue;
        if (!key || INVALID_NAME.test(key)) {
          report('error', path, `nome "${key}" inválido: nomes não podem ser vazios nem ter ".", "{" ou "}".`);
          continue;
        }
        const childSegments = [...segments, key];
        const childPath = childSegments.join('.');
        if (!isObject(child)) {
          report('error', childPath, 'não é token nem grupo — um token precisa de "$value".');
        } else if ('$value' in child) {
          readToken(child, childPath, own);
        } else if (key === ROOT_TOKEN) {
          report('error', childPath, '"$root" precisa ser um token, com "$value".');
        } else {
          walkGroup(child, childSegments, own);
        }
      }
    };

    walkGroup(json, [], {});
  }

  const allModes = modes.length ? modes : [DEFAULT_TOKEN_MODE];
  const tokens: ParsedToken[] = [];
  for (const [path, entry] of entries) {
    const defs = [entry.base, ...entry.byMode.values()].filter((d): d is Definition => d !== undefined);
    const file = defs[0]!.file;
    const types = [...new Set(defs.flatMap((d) => (d.type === undefined ? [] : [d.type])))];
    if (types.length > 1) {
      diagnostics.push({ severity: 'error', file, path, message: `"$type" diferente entre os arquivos: ${types.join(', ')}.` });
      continue;
    }
    const byMode: Record<string, TokenValue> = {};
    const missing: string[] = [];
    for (const mode of allModes) {
      const def = entry.byMode.get(mode) ?? entry.base;
      if (def) byMode[mode] = def.value;
      else missing.push(mode);
    }
    if (missing.length) {
      diagnostics.push({
        severity: 'error',
        file,
        path,
        message: `sem valor no modo ${missing.join(', ')} — defina o token num arquivo base ou em todos os modos.`,
      });
      continue;
    }
    const token: ParsedToken = { path, byMode, file };
    if (types[0] !== undefined) token.type = types[0];
    const description = defs.find((d) => d.description !== undefined)?.description;
    if (description !== undefined) token.description = description;
    const deprecated = defs.find((d) => d.deprecated !== undefined)?.deprecated;
    if (deprecated !== undefined) token.deprecated = deprecated;
    tokens.push(token);
  }

  return { modes: allModes, tokens, diagnostics };
}
