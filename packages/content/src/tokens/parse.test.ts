import { describe, expect, it } from 'vitest';
import { parseTokenSources } from './parse.js';
import type { TokenSource } from './types.js';

const source = (file: string, json: unknown, mode?: string): TokenSource =>
  mode === undefined ? { file, content: JSON.stringify(json) } : { file, content: JSON.stringify(json), mode };

describe('parseTokenSources', () => {
  it('grupos aninhados viram o path, na ordem do arquivo', () => {
    const { tokens, modes, diagnostics } = parseTokenSources([
      source('tokens.json', {
        color: {
          brand: { 500: { $value: '#0a84ff', $type: 'color' }, 600: { $value: '#0060df', $type: 'color' } },
        },
        space: { sm: { $value: '4px', $type: 'dimension', $description: 'Espaço curto' } },
      }),
    ]);
    expect(diagnostics).toEqual([]);
    expect(modes).toEqual(['default']);
    // Chaves numéricas vêm antes no JSON (regra de ordem do JS para objetos).
    expect(tokens).toEqual([
      { path: 'color.brand.500', type: 'color', byMode: { default: '#0a84ff' }, file: 'tokens.json', fileByMode: { default: 'tokens.json' } },
      { path: 'color.brand.600', type: 'color', byMode: { default: '#0060df' }, file: 'tokens.json', fileByMode: { default: 'tokens.json' } },
      {
        path: 'space.sm',
        type: 'dimension',
        description: 'Espaço curto',
        byMode: { default: '4px' },
        file: 'tokens.json',
        fileByMode: { default: 'tokens.json' },
      },
    ]);
  });

  it('$type herdado do grupo mais próximo; o do token vence', () => {
    const { tokens } = parseTokenSources([
      source('t.json', {
        size: {
          $type: 'dimension',
          sm: { $value: '4px' },
          weight: { $type: 'fontWeight', bold: { $value: 700 } },
          ratio: { $value: 1.5, $type: 'number' },
        },
        alias: { $value: '{size.sm}' },
      }),
    ]);
    expect(Object.fromEntries(tokens.map((t) => [t.path, t.type]))).toEqual({
      'size.sm': 'dimension',
      'size.weight.bold': 'fontWeight',
      'size.ratio': 'number',
      alias: undefined,
    });
  });

  it('$deprecated do grupo vale para os tokens de dentro', () => {
    const { tokens } = parseTokenSources([
      source('t.json', {
        old: { $deprecated: 'Use color.brand', a: { $value: '#000', $type: 'color' }, b: { $value: '#111', $type: 'color', $deprecated: false } },
      }),
    ]);
    expect(tokens.map((t) => t.deprecated)).toEqual(['Use color.brand', false]);
  });

  it('mescla vários arquivos base', () => {
    const { tokens, diagnostics } = parseTokenSources([
      source('color.json', { color: { $type: 'color', red: { $value: '#f00' } } }),
      source('space.json', { space: { $type: 'dimension', sm: { $value: '4px' } } }),
    ]);
    expect(diagnostics).toEqual([]);
    expect(tokens.map((t) => [t.path, t.file])).toEqual([
      ['color.red', 'color.json'],
      ['space.sm', 'space.json'],
    ]);
  });

  it('grupos de mesmo caminho em arquivos diferentes são um grupo só', () => {
    const { tokens, diagnostics } = parseTokenSources([
      source('a.json', { color: { $type: 'color', $deprecated: true } }),
      source('b.json', { color: { blue: { $value: '#00f' } } }),
    ]);
    expect(diagnostics).toEqual([]);
    expect(tokens).toEqual([
      { path: 'color.blue', type: 'color', deprecated: true, byMode: { default: '#00f' }, file: 'b.json', fileByMode: { default: 'b.json' } },
    ]);
  });

  it('$type do grupo diferente entre arquivos avisa e vale o último', () => {
    const { tokens, diagnostics } = parseTokenSources([
      source('a.json', { x: { $type: 'color' } }),
      source('b.json', { x: { $type: 'dimension', y: { $value: '4px' } } }),
    ]);
    expect(tokens[0]!.type).toBe('dimension');
    expect(diagnostics).toEqual([
      { severity: 'warning', file: 'b.json', path: 'x', message: '"$type" do grupo diferente entre os arquivos (color, dimension); vale o último.' },
    ]);
  });

  it('caminho que é token num arquivo e grupo em outro é erro', () => {
    const { tokens, diagnostics } = parseTokenSources([
      source('a.json', { color: { brand: { $value: '#00f', $type: 'color' }, ok: { $value: '#000', $type: 'color' } } }),
      source('b.json', { color: { brand: { 500: { $value: '#0af', $type: 'color' } } } }),
      source('c.json', { space: { $value: '4px', $type: 'dimension' } }),
      source('d.json', { space: { $type: 'dimension' } }),
    ]);
    expect(tokens.map((t) => t.path)).toEqual(['color.ok']);
    expect(diagnostics).toEqual([
      { severity: 'error', file: 'a.json', path: 'color.brand', message: 'é token e grupo ao mesmo tempo (color.brand.500 está dentro dele).' },
      { severity: 'error', file: 'c.json', path: 'space', message: 'é token e grupo ao mesmo tempo (declarado como grupo em d.json).' },
    ]);
  });

  it('file é o da primeira definição', () => {
    const { tokens } = parseTokenSources([
      source('a1.json', { x: { $value: 1, $type: 'number' } }),
      source('a2.json', { x: { $value: 2, $type: 'number' } }),
    ]);
    expect(tokens[0]!.file).toBe('a1.json');
  });

  it('redefinição avisa e vale a última', () => {
    const { tokens, diagnostics } = parseTokenSources([
      source('a.json', { x: { $value: 1, $type: 'number' } }),
      source('b.json', { x: { $value: 2, $type: 'number' } }),
    ]);
    expect(tokens[0]!.byMode).toEqual({ default: 2 });
    expect(diagnostics).toEqual([
      { severity: 'warning', file: 'b.json', path: 'x', message: 'token redefinido (já estava em a.json); vale esta definição.' },
    ]);
  });

  describe('modos', () => {
    it('arquivos de modo sobrepõem o base, na ordem em que aparecem', () => {
      const { tokens, modes, diagnostics } = parseTokenSources([
        source('base.json', { color: { $type: 'color', bg: { $value: '#fff' }, brand: { $value: '#0a84ff' } } }),
        source('light.json', {}, 'light'),
        source('dark.json', { color: { bg: { $value: '#000' } } }, 'dark'),
      ]);
      expect(diagnostics).toEqual([]);
      expect(modes).toEqual(['light', 'dark']);
      expect(tokens).toEqual([
        {
          path: 'color.bg',
          type: 'color',
          byMode: { light: '#fff', dark: '#000' },
          file: 'base.json',
          fileByMode: { light: 'base.json', dark: 'dark.json' },
        },
        {
          path: 'color.brand',
          type: 'color',
          byMode: { light: '#0a84ff', dark: '#0a84ff' },
          file: 'base.json',
          fileByMode: { light: 'base.json', dark: 'base.json' },
        },
      ]);
    });

    it('um arquivo por modo, sem base (export do Figma)', () => {
      const { tokens, diagnostics } = parseTokenSources([
        source('light.json', { bg: { $type: 'color', $value: '#fff' } }, 'light'),
        source('dark.json', { bg: { $type: 'color', $value: '#000' } }, 'dark'),
      ]);
      expect(diagnostics).toEqual([]);
      expect(tokens[0]!.byMode).toEqual({ light: '#fff', dark: '#000' });
    });

    it('token sem valor em algum modo é erro e fica de fora', () => {
      const { tokens, diagnostics } = parseTokenSources([
        source('light.json', { bg: { $type: 'color', $value: '#fff' }, fg: { $type: 'color', $value: '#000' } }, 'light'),
        source('dark.json', { bg: { $type: 'color', $value: '#000' } }, 'dark'),
      ]);
      expect(tokens.map((t) => t.path)).toEqual(['bg']);
      expect(diagnostics).toEqual([
        {
          severity: 'error',
          file: 'light.json',
          path: 'fg',
          message: 'sem valor no modo dark — defina o token num arquivo base ou em todos os modos.',
        },
      ]);
    });

    it('$type diferente entre arquivos é erro', () => {
      const { tokens, diagnostics } = parseTokenSources([
        source('base.json', { x: { $type: 'color', $value: '#fff' } }),
        source('dark.json', { x: { $type: 'dimension', $value: '4px' } }, 'dark'),
      ]);
      expect(tokens).toEqual([]);
      expect(diagnostics).toEqual([
        { severity: 'error', file: 'dark.json', path: 'x', message: '"$type" diferente entre os arquivos: color, dimension.' },
      ]);
    });

    it('modo de um arquivo com JSON inválido não entra no conjunto', () => {
      const { modes, tokens, diagnostics } = parseTokenSources([
        source('light.json', { bg: { $type: 'color', $value: '#fff' } }, 'light'),
        { file: 'dark.json', content: '{ "bg": ', mode: 'dark' },
      ]);
      expect(modes).toEqual(['light']);
      expect(tokens).toHaveLength(1);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.message).toMatch(/^JSON inválido: /);
    });

    it('nome de modo vazio ou __proto__ é erro', () => {
      const { diagnostics, modes } = parseTokenSources([source('x.json', {}, ' '), source('y.json', {}, '__proto__')]);
      expect(modes).toEqual(['default']);
      expect(diagnostics).toEqual([
        { severity: 'error', file: 'x.json', message: 'nome de modo inválido: " ".' },
        { severity: 'error', file: 'y.json', message: 'nome de modo inválido: "__proto__".' },
      ]);
    });

    it('$type do grupo no base vale para os tokens dos arquivos de modo', () => {
      const { tokens } = parseTokenSources([
        source('base.json', { color: { $type: 'color' } }),
        source('light.json', { color: { bg: { $value: '#fff' } } }, 'light'),
        source('dark.json', { color: { bg: { $value: '#000' } } }, 'dark'),
      ]);
      expect(tokens).toEqual([
        {
          path: 'color.bg',
          type: 'color',
          byMode: { light: '#fff', dark: '#000' },
          file: 'light.json',
          fileByMode: { light: 'light.json', dark: 'dark.json' },
        },
      ]);
    });

    it('description e deprecated: vale a última definição que traz o campo', () => {
      const { tokens } = parseTokenSources([
        source('base.json', { bg: { $type: 'color', $value: '#fff', $description: 'Fundo' } }),
        source('dark.json', { bg: { $value: '#000', $description: 'Fundo escuro' } }, 'dark'),
        source('light.json', { bg: { $value: '#fafafa' } }, 'light'),
      ]);
      expect(tokens[0]).toMatchObject({ description: 'Fundo escuro', byMode: { dark: '#000', light: '#fafafa' } });
    });
  });

  describe('estrutura inválida', () => {
    it('a raiz precisa ser um grupo', () => {
      const { diagnostics } = parseTokenSources([
        { file: 'a.json', content: '[]' },
        source('b.json', { $value: '#fff' }),
      ]);
      expect(diagnostics.map((d) => [d.file, d.message])).toEqual([
        ['a.json', 'o arquivo deve ser um objeto com grupos e tokens.'],
        ['b.json', 'o arquivo deve ser um objeto com grupos e tokens.'],
      ]);
    });

    it('nome com ".", "{" ou "}" é erro', () => {
      const { tokens, diagnostics } = parseTokenSources([
        source('t.json', { color: { 'a.b': { $value: '#fff', $type: 'color' }, ok: { $value: '#000', $type: 'color' } } }),
      ]);
      expect(tokens.map((t) => t.path)).toEqual(['color.ok']);
      expect(diagnostics).toEqual([
        {
          severity: 'error',
          file: 't.json',
          path: 'color',
          message: 'nome "a.b" inválido: nomes não podem ser vazios nem ter ".", "{" ou "}".',
        },
      ]);
    });

    it('valor solto (sem $value) é erro', () => {
      const { diagnostics } = parseTokenSources([source('t.json', { color: { red: '#f00' } })]);
      expect(diagnostics).toEqual([
        { severity: 'error', file: 't.json', path: 'color.red', message: 'não é token nem grupo — um token precisa de "$value".' },
      ]);
    });

    it('$value null e $type que não é texto são erros', () => {
      const { tokens, diagnostics } = parseTokenSources([
        source('t.json', { a: { $value: null }, b: { $value: 1, $type: 3 } }),
      ]);
      expect(tokens).toEqual([]);
      expect(diagnostics.map((d) => [d.path, d.message])).toEqual([
        ['a', '"$value" está vazio.'],
        ['b', '"$type" deve ser um texto.'],
      ]);
    });

    it('propriedades desconhecidas e filhos de token só avisam', () => {
      const { tokens, diagnostics } = parseTokenSources([
        source('t.json', {
          $schema: 'https://example.com/schema.json',
          color: {
            $extends: '{base}',
            red: { $value: '#f00', $type: 'color', $extensions: { 'com.figma': {} }, $foo: 1, dark: { $value: '#800' } },
          },
        }),
      ]);
      expect(tokens.map((t) => t.path)).toEqual(['color.red']);
      expect(diagnostics.map((d) => [d.severity, d.path, d.message])).toEqual([
        ['warning', 'color', 'propriedade "$extends" não suportada em grupo; ignorada.'],
        ['warning', 'color.red', 'propriedade "$foo" não suportada; ignorada.'],
        ['warning', 'color.red', '"dark" ignorado: um token não pode conter outros tokens ou grupos.'],
      ]);
    });
  });

  it('grupo que só declara e não tem token em arquivo nenhum avisa', () => {
    const { tokens, diagnostics } = parseTokenSources([
      source('a.json', { c: { $type: 'color' }, d: { $type: 'color' } }),
      source('b.json', { d: { x: { $value: '#000' } } }),
    ]);
    expect(tokens.map((t) => t.path)).toEqual(['d.x']);
    expect(diagnostics).toEqual([{ severity: 'warning', file: 'a.json', path: 'c', message: 'grupo sem nenhum token — faltou o "$value"?' }]);
  });

  it('$root no topo do arquivo é erro', () => {
    const { tokens, diagnostics } = parseTokenSources([source('t.json', { $root: { $value: 1, $type: 'number' } })]);
    expect(tokens).toEqual([]);
    expect(diagnostics).toEqual([{ severity: 'error', file: 't.json', path: '$root', message: '"$root" só existe dentro de um grupo.' }]);
  });

  it('$root é o token do próprio grupo', () => {
    const { tokens, diagnostics } = parseTokenSources([
      source('t.json', { accent: { $type: 'color', $root: { $value: '#0a84ff' }, light: { $value: '#5ab0ff' } } }),
    ]);
    expect(diagnostics).toEqual([]);
    expect(tokens.map((t) => t.path)).toEqual(['accent.$root', 'accent.light']);
  });
});
