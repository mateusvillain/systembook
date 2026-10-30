import { describe, expect, it } from 'vitest';
import { createTranslator, resolveLocale } from './format.js';

const messages = {
  hello: 'Hello, {name}!',
  plain: 'No variables',
  results: { one: '{count} result', other: '{count} results' },
  pages: { zero: 'No pages', one: '{count} page', other: '{count} pages' },
};

describe('createTranslator (SYS-161)', () => {
  const t = createTranslator(messages, 'en');

  it('interpola variáveis e mantém as desconhecidas', () => {
    expect(t('hello', { name: 'Ana' })).toBe('Hello, Ana!');
    expect(t('hello')).toBe('Hello, {name}!');
    expect(t('plain', { name: 'x' })).toBe('No variables');
  });

  it('escolhe a forma de plural pelo count', () => {
    expect(t('results', { count: 1 })).toBe('1 result');
    expect(t('results', { count: 3 })).toBe('3 results');
    expect(t('results')).toBe('{count} results');
  });

  it('cai em other quando a categoria não está no dicionário', () => {
    // Em inglês 0 é "other": a forma `zero` só vale para idiomas que a usam.
    expect(t('pages', { count: 0 })).toBe('0 pages');
  });

  it('usa as regras de plural do locale', () => {
    const pt = createTranslator(messages, 'pt-BR');
    // pt-BR trata 0 como "one" (0 resultado), diferente do inglês.
    expect(pt('results', { count: 0 })).toBe('0 result');
    expect(pt('results', { count: 2 })).toBe('2 results');
  });

  it('devolve a chave quando ela não existe no dicionário', () => {
    const loose = createTranslator<string>(messages, 'en');
    expect(loose('missing')).toBe('missing');
  });
});

describe('resolveLocale (SYS-161)', () => {
  const available = ['en', 'pt-BR'] as const;

  it('casa o locale exato sem diferenciar caixa', () => {
    expect(resolveLocale('pt-br', available, 'en')).toBe('pt-BR');
    expect(resolveLocale('EN', available, 'en')).toBe('en');
  });

  it('casa pelo idioma base', () => {
    expect(resolveLocale('pt', available, 'en')).toBe('pt-BR');
    expect(resolveLocale('pt-PT', available, 'en')).toBe('pt-BR');
    expect(resolveLocale('en-GB', available, 'en')).toBe('en');
  });

  it('cai no fallback sem correspondência ou sem locale', () => {
    expect(resolveLocale('fr', available, 'en')).toBe('en');
    expect(resolveLocale(undefined, available, 'en')).toBe('en');
    expect(resolveLocale('', available, 'en')).toBe('en');
  });
});
