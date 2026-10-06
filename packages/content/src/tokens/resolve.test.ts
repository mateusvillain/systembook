import { describe, expect, it } from 'vitest';
import { parseTokenSources } from './parse.js';
import { aliasTarget, resolveTokens } from './resolve.js';
import type { TokenSource } from './types.js';

/** Parse + resolução, como o pipeline faz; o parse aqui não pode ter erro. */
function resolve(...sources: TokenSource[]) {
  const parsed = parseTokenSources(sources);
  expect(parsed.diagnostics).toEqual([]);
  return resolveTokens(parsed.tokens, parsed.modes);
}

const source = (json: unknown, mode?: string, file = mode ? `${mode}.json` : 'tokens.json'): TokenSource =>
  mode === undefined ? { file, content: JSON.stringify(json) } : { file, content: JSON.stringify(json), mode };

const values = (tokens: ReturnType<typeof resolve>['tokens'], mode = 'default') =>
  Object.fromEntries(tokens.map((t) => [t.path, t.byMode[mode]!.resolvedValue]));

describe('aliasTarget', () => {
  it('só o valor inteiro entre chaves', () => {
    expect(aliasTarget('{color.blue.500}')).toBe('color.blue.500');
    expect(aliasTarget('{a}')).toBe('a');
    expect(aliasTarget('calc({a} * 2)')).toBeUndefined();
    expect(aliasTarget('{}')).toBeUndefined();
    expect(aliasTarget(4)).toBeUndefined();
  });
});

describe('resolveTokens', () => {
  it('alias simples e encadeado; aliasOf é a primeira referência', () => {
    const { tokens, diagnostics } = resolve(
      source({
        color: {
          $type: 'color',
          blue: { $value: '#0a84ff' },
          brand: { $value: '{color.blue}' },
          action: { $value: '{color.brand}' },
        },
      }),
    );
    expect(diagnostics).toEqual([]);
    expect(values(tokens)).toEqual({ 'color.blue': '#0a84ff', 'color.brand': '#0a84ff', 'color.action': '#0a84ff' });
    expect(tokens[2]!.byMode.default).toEqual({ value: '{color.brand}', resolvedValue: '#0a84ff', aliasOf: 'color.brand' });
    expect(tokens[0]!.byMode.default!.aliasOf).toBeUndefined();
  });

  it('aliases em campos de valor composto e em listas', () => {
    const { tokens, diagnostics } = resolve(
      source({
        black: { $type: 'color', $value: '#000' },
        size: { $type: 'dimension', $value: '2px' },
        shadow: {
          $type: 'shadow',
          $value: [{ color: '{black}', offsetX: '0px', offsetY: '{size}', blur: '4px', spread: '0px' }],
        },
      }),
    );
    expect(diagnostics).toEqual([]);
    expect(tokens[2]!.byMode.default).toEqual({
      value: [{ color: '{black}', offsetX: '0px', offsetY: '{size}', blur: '4px', spread: '0px' }],
      resolvedValue: [{ color: '#000', offsetX: '0px', offsetY: '2px', blur: '4px', spread: '0px' }],
    });
  });

  it('o alias é resolvido dentro do modo', () => {
    const { tokens } = resolve(
      source({ color: { $type: 'color', text: { $value: '{color.fg}' } } }),
      source({ color: { fg: { $value: '#111' } } }, 'light'),
      source({ color: { fg: { $value: '#eee' } } }, 'dark'),
    );
    const text = tokens.find((t) => t.path === 'color.text')!;
    expect(text.byMode.light!.resolvedValue).toBe('#111');
    expect(text.byMode.dark!.resolvedValue).toBe('#eee');
  });

  it('sem $type, herda o do token apontado, seguindo a cadeia', () => {
    const { tokens } = resolve(
      source({ base: { $type: 'dimension', $value: '4px' }, a: { $value: '{base}' }, b: { $value: '{a}' } }),
    );
    expect(tokens.map((t) => t.type)).toEqual(['dimension', 'dimension', 'dimension']);
  });

  it('alias quebrado é erro, com sugestão; quem depende dele cai junto', () => {
    const { tokens, diagnostics } = resolve(
      source({
        color: { $type: 'color', blue: { $value: '#00f' }, brand: { $value: '{color.bleu}' }, action: { $value: '{color.brand}' } },
      }),
    );
    expect(tokens.map((t) => t.path)).toEqual(['color.blue']);
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        file: 'tokens.json',
        path: 'color.brand',
        message: 'o alias {color.bleu} aponta para um token que não existe (quis dizer "color.blue"?).',
      },
      { severity: 'error', file: 'tokens.json', path: 'color.action', message: 'o alias {color.brand} aponta para um token com erro.' },
    ]);
  });

  it('alias para um grupo é erro', () => {
    const { diagnostics } = resolve(source({ color: { $type: 'color', blue: { 500: { $value: '#00f' } }, x: { $value: '{color.blue}' } } }));
    expect(diagnostics.map((d) => d.message)).toEqual(['o alias {color.blue} aponta para um grupo, não para um token.']);
  });

  it('referência circular é erro em cada token do ciclo, sem loop infinito', () => {
    const { tokens, diagnostics } = resolve(
      source({ $type: 'number', a: { $value: '{b}' }, b: { $value: '{c}' }, c: { $value: '{a}' }, self: { $value: '{self}' }, ok: { $value: 1 } }),
    );
    expect(tokens.map((t) => t.path)).toEqual(['ok']);
    expect(diagnostics.map((d) => [d.path, d.message])).toEqual([
      ['a', 'referência circular: a → b → c → a.'],
      ['b', 'referência circular: b → c → a → b.'],
      ['c', 'referência circular: c → a → b → c.'],
      ['self', 'referência circular: self → self.'],
    ]);
  });

  it('com vários modos, o erro diz o modo, uma vez por token', () => {
    const { diagnostics } = resolve(
      source({ x: { $type: 'color', $value: '{y}' }, y: { $type: 'color', $value: '#fff' } }, 'light'),
      source({ x: { $type: 'color', $value: '{z}' }, y: { $type: 'color', $value: '#000' } }, 'dark'),
    );
    expect(diagnostics.map((d) => d.message)).toEqual(['o alias {z} aponta para um token que não existe (quis dizer "y"?) (modo dark).']);
  });

  it('$type diferente do token apontado é erro, e quem aponta para ele cai junto', () => {
    const { tokens, diagnostics } = resolve(
      source({
        space: { $type: 'dimension', $value: '4px' },
        color: { $type: 'color', $value: '{space}' },
        shadow: { $type: 'shadow', $value: { color: '{color}', offsetX: '0px', offsetY: '0px', blur: '0px', spread: '0px' } },
      }),
    );
    expect(tokens.map((t) => t.path)).toEqual(['space']);
    expect(diagnostics.map((d) => [d.path, d.message])).toEqual([
      ['color', '"$type" é color, mas o alias {space} aponta para um token dimension.'],
      ['shadow', 'o alias {color} aponta para um token com erro.'],
    ]);
  });

  it('sem $type, aliases de tipos diferentes entre os modos é erro', () => {
    const { diagnostics } = resolve(
      source({ c: { $type: 'color', $value: '#fff' }, d: { $type: 'dimension', $value: '1px' } }),
      source({ x: { $value: '{c}' } }, 'light'),
      source({ x: { $value: '{d}' } }, 'dark'),
    );
    expect(diagnostics.map((d) => [d.path, d.message])).toEqual([
      ['x', 'os aliases apontam para tokens de tipos diferentes (color, dimension); declare o "$type".'],
    ]);
  });

  it('chave __proto__ num valor composto continua chave', () => {
    const { tokens } = resolve({ file: 't.json', content: '{"x":{"$type":"typography","$value":{"__proto__":"{y}"}},"y":{"$type":"number","$value":1}}' });
    const resolved = tokens[0]!.byMode.default!.resolvedValue as Record<string, unknown>;
    expect(Object.keys(resolved)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(resolved)).toBe(Object.prototype);
  });
});
