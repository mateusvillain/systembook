import { describe, expect, it } from 'vitest';
import { loadTokenSet } from './load.js';
import type { TokenSource } from './types.js';

const source = (json: unknown, mode?: string, file = mode ? `${mode}.json` : 'tokens.json'): TokenSource =>
  mode === undefined ? { file, content: JSON.stringify(json) } : { file, content: JSON.stringify(json), mode };

/** Um token só, do tipo dado; devolve as mensagens (e se o token passou). */
function check(type: string, value: unknown) {
  const { set, diagnostics } = loadTokenSet([source({ t: { $type: type, $value: value } })]);
  return { ok: set.tokens.length === 1, messages: diagnostics.map((d) => `${d.severity}: ${d.message}`) };
}

describe('validação por tipo', () => {
  it.each([
    ['color', '#0a84ff'],
    ['color', '#fff8'],
    ['color', 'rgb(10 132 255 / 50%)'],
    ['color', 'transparent'],
    ['color', { colorSpace: 'srgb', components: [0.04, 0.52, 1], alpha: 1, hex: '#0a84ff' }],
    ['color', { colorSpace: 'oklch', components: [0.6, 0.2, 'none'] }],
    ['dimension', '16px'],
    ['dimension', '-0.5rem'],
    ['dimension', '0'],
    ['dimension', { value: 16, unit: 'px' }],
    ['fontFamily', 'Inter'],
    ['fontFamily', ['Inter', 'sans-serif']],
    ['fontWeight', 700],
    ['fontWeight', 'semi-bold'],
    ['duration', '200ms'],
    ['duration', { value: 0.2, unit: 's' }],
    ['cubicBezier', [0.4, 0, 0.2, 1]],
    ['number', 1.5],
    ['strokeStyle', 'dashed'],
    ['strokeStyle', { dashArray: ['2px', { value: 4, unit: 'px' }], lineCap: 'round' }],
    ['border', { color: '#000', width: '1px', style: 'solid' }],
    ['transition', { duration: '200ms', delay: '0ms', timingFunction: [0.4, 0, 0.2, 1] }],
    ['shadow', { color: '#0003', offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px' }],
    ['shadow', [{ color: '#0003', offsetX: '0px', offsetY: '2px', blur: '8px', spread: '0px', inset: true }]],
    ['gradient', [{ color: '#000', position: 0 }, { color: '#fff', position: 1 }]],
    ['typography', { fontFamily: 'Inter', fontSize: '16px', fontWeight: 400, letterSpacing: '0px', lineHeight: 1.5 }],
    ['typography', { fontFamily: ['Inter'], fontSize: '16px', fontWeight: 'bold', letterSpacing: '0px', lineHeight: '24px' }],
  ])('%s aceita %j', (type, value) => {
    expect(check(type, value)).toEqual({ ok: true, messages: [] });
  });

  it.each([
    ['color', '#0a84fg', '"#0a84fg" não é uma cor ("#0a84ff", "rgb(…)" ou { colorSpace, components }).'],
    ['color', 12, '12 não é uma cor ("#0a84ff", "rgb(…)" ou { colorSpace, components }).'],
    ['color', { colorSpace: 'srgb', components: [1, 0] }, '{"colorSpace":"srgb","components":[1,0]} não é uma cor ("#0a84ff", "rgb(…)" ou { colorSpace, components }).'],
    ['dimension', '16 px', '"16 px" não é uma dimensão ("16px" ou { value, unit }).'],
    ['dimension', 16, '16 não é uma dimensão ("16px" ou { value, unit }).'],
    ['fontFamily', [], '[] não é uma família de fonte (texto ou lista de textos).'],
    ['fontWeight', 1200, '1200 não é um peso de fonte (1 a 1000 ou um nome como "bold").'],
    ['fontWeight', 'heavyish', '"heavyish" não é um peso de fonte (1 a 1000 ou um nome como "bold").'],
    ['duration', '2 seconds', '"2 seconds" não é uma duração ("200ms" ou { value, unit }).'],
    ['cubicBezier', [1.2, 0, 0.2, 1], '[1.2,0,0.2,1] não é uma curva [x1, y1, x2, y2], com x1 e x2 entre 0 e 1.'],
    ['number', '1.5', '"1.5" não é um número.'],
    ['strokeStyle', 'wavy', '"wavy" não é um estilo de traço ("solid", "dashed"… ou { dashArray, lineCap }).'],
    ['border', '1px solid #000', 'deve ser um objeto com color, width, style.'],
    ['shadow', [], 'a sombra deve ser um objeto ou uma lista não vazia.'],
    ['gradient', { color: '#000', position: 0 }, 'o gradiente deve ser uma lista não vazia.'],
  ])('%s recusa %j', (type, value, message) => {
    expect(check(type, value)).toEqual({ ok: false, messages: [`error: ${message}`] });
  });

  it('composto: campo errado é erro, com o item da lista', () => {
    expect(check('shadow', [{ color: '#000', offsetX: '0px', offsetY: '0px', blur: '1px', spread: '0px' }, { color: 'nope!', offsetX: '0px', offsetY: '0px', blur: '1px', spread: '0px' }]))
      .toEqual({ ok: false, messages: ['error: item 2: campo "color": "nope!" não é uma cor ("#0a84ff", "rgb(…)" ou { colorSpace, components }).'] });
  });

  it('composto: campo faltando ou desconhecido só avisa', () => {
    expect(check('typography', { fontFamily: 'Inter', fontSize: '16px', fontWeight: 400, lineHeight: 1.5, textCase: 'upper' })).toEqual({
      ok: true,
      messages: ['warning: campo "letterSpacing" ausente.', 'warning: campo "textCase" não faz parte de typography; ignorado.'],
    });
  });
});

describe('tipo do token', () => {
  it('sem $type é erro', () => {
    const { set, diagnostics } = loadTokenSet([source({ x: { $value: '#fff' } })]);
    expect(set.tokens).toEqual([]);
    expect(diagnostics.map((d) => d.message)).toEqual(['sem "$type" — declare no token ou num grupo acima dele.']);
  });

  it('$type desconhecido é erro, com sugestão', () => {
    expect(check('colour', '#fff').messages).toEqual(['error: "$type" desconhecido: "colour" (quis dizer "color"?).']);
  });
});

describe('aliases e modos', () => {
  it('campo de composto que aponta para token de outro tipo é erro', () => {
    const { set, diagnostics } = loadTokenSet([
      source({
        space: { $type: 'dimension', $value: '4px' },
        card: { $type: 'shadow', $value: { color: '{space}', offsetX: '0px', offsetY: '0px', blur: '0px', spread: '0px' } },
      }),
    ]);
    expect(set.tokens.map((t) => t.path)).toEqual(['space']);
    expect(diagnostics.map((d) => [d.path, d.message])).toEqual([['card', 'campo "color" aponta para {space}, que é dimension.']]);
  });

  it('alias para token inválido aponta a causa, e quem depende cai junto', () => {
    const { set, diagnostics } = loadTokenSet([
      source({
        color: { $type: 'color', bad: { $value: '#zzz' }, alias: { $value: '{color.bad}' } },
        border: { $type: 'border', $value: { color: '{color.alias}', width: '1px', style: 'solid' } },
        ok: { $type: 'number', $value: 1 },
      }),
    ]);
    expect(set.tokens.map((t) => t.path)).toEqual(['ok']);
    expect(diagnostics.map((d) => [d.path, d.message])).toEqual([
      ['color.bad', '"#zzz" não é uma cor ("#0a84ff", "rgb(…)" ou { colorSpace, components }).'],
      ['color.alias', 'o alias {color.bad} aponta para um token com erro.'],
      ['border', 'o alias {color.alias} aponta para um token com erro.'],
    ]);
  });

  it('valida cada modo; o erro diz o modo e os avisos não repetem', () => {
    const { set, diagnostics } = loadTokenSet([
      source({ t: { $type: 'typography', $value: { fontFamily: 'Inter', fontSize: '16px', fontWeight: 400, lineHeight: 1.5 } } }),
      source({}, 'light'),
      source({ x: { $type: 'color', $value: '#fff' } }, 'light'),
      source({ x: { $type: 'color', $value: 'not a color' } }, 'dark'),
    ]);
    expect(set.modes).toEqual(['light', 'dark']);
    expect(set.tokens.map((t) => t.path)).toEqual(['t']);
    expect(diagnostics.map((d) => [d.severity, d.path, d.message])).toEqual([
      ['warning', 't', 'campo "letterSpacing" ausente.'],
      ['error', 'x', '"not a color" não é uma cor ("#0a84ff", "rgb(…)" ou { colorSpace, components }) (modo dark).'],
    ]);
  });
});

describe('loadTokenSet', () => {
  it('devolve o TokenSet do schema, sem o arquivo de origem', () => {
    const { set, diagnostics } = loadTokenSet([
      source({ color: { $type: 'color', blue: { $value: '#0a84ff', $description: 'Azul' }, brand: { $value: '{color.blue}', $deprecated: 'Use color.blue' } } }),
    ]);
    expect(diagnostics).toEqual([]);
    expect(set).toEqual({
      modes: ['default'],
      tokens: [
        { path: 'color.blue', type: 'color', description: 'Azul', byMode: { default: { value: '#0a84ff', resolvedValue: '#0a84ff' } } },
        {
          path: 'color.brand',
          type: 'color',
          deprecated: 'Use color.blue',
          byMode: { default: { value: '{color.blue}', resolvedValue: '#0a84ff', aliasOf: 'color.blue' } },
        },
      ],
    });
  });

  it('junta os diagnósticos das três etapas', () => {
    const { diagnostics } = loadTokenSet([
      source({ a: { $value: 1, $type: 'number', $foo: 1 }, b: { $value: '{c}', $type: 'number' }, d: { $value: 'x', $type: 'number' } }),
    ]);
    expect(diagnostics.map((d) => d.message)).toEqual([
      'propriedade "$foo" não suportada; ignorada.',
      'o alias {c} aponta para um token que não existe (quis dizer "a"?).',
      '"x" não é um número.',
    ]);
  });
});
