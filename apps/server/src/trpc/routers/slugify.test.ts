import { describe, expect, it } from 'vitest';
import { slugify } from './pages.js';

describe('slugify (TASK-70)', () => {
  it('minúscula e hifeniza espaços/pontuação', () => {
    expect(slugify('Get started')).toBe('get-started');
    expect(slugify('Design Tokens & Cores')).toBe('design-tokens-cores');
  });

  it('remove acentos (títulos em PT)', () => {
    expect(slugify('Botão')).toBe('botao');
    expect(slugify('Introdução à Acessibilidade')).toBe('introducao-a-acessibilidade');
    expect(slugify('Configuração')).toBe('configuracao');
  });

  it('colapsa runs de não-alfanuméricos num único hífen e apara as pontas', () => {
    expect(slugify('  Olá   mundo!!!  ')).toBe('ola-mundo');
    expect(slugify('a---b')).toBe('a-b');
    expect(slugify('__Já__')).toBe('ja');
  });

  it('devolve vazio quando não há caracteres sluggáveis', () => {
    expect(slugify('🎉🎉')).toBe('');
    expect(slugify('---')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('o resultado não-vazio sempre casa o slugSchema', () => {
    const re = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const t of ['Get started', 'Botão', 'A B C', 'v2.0 Beta', 'Ícones 24px']) {
      const s = slugify(t);
      expect(s.length > 0 && re.test(s)).toBe(true);
    }
  });
});
