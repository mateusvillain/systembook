import { describe, expect, it } from 'vitest';
import {
  hreflangLinks,
  isLocaleCode,
  localeSegment,
  localizedHomePath,
  localizedSitePath,
  splitLocalePrefix,
} from './locale.js';

const ref = { menuSlug: 'foundation', sectionSlug: 'color', pageSlug: 'palette' };
const locales = ['en', 'pt-BR', 'es'];

describe('isLocaleCode', () => {
  it('aceita a forma BCP 47', () => {
    for (const code of ['en', 'pt-BR', 'pt-br', 'zh-Hant-TW', 'es-419', 'ast']) expect(isLocaleCode(code)).toBe(true);
  });

  it('rejeita o resto', () => {
    for (const code of ['', 'e', 'english', 'pt_BR', 'pt-', '-pt', 'pt-BR/x', 'pt BR', `en-${'a'.repeat(8)}-${'b'.repeat(30)}`]) {
      expect(isLocaleCode(code)).toBe(false);
    }
  });
});

describe('caminhos por idioma', () => {
  it('segmento em minúsculas', () => {
    expect(localeSegment('pt-BR')).toBe('pt-br');
    expect(localeSegment('en')).toBe('en');
  });

  it('o padrão fica sem prefixo', () => {
    expect(localizedSitePath('en', ref, 'en')).toBe('/foundation/color/palette');
    expect(localizedSitePath('en', ref, 'en', 'usage')).toBe('/foundation/color/palette/usage');
    expect(localizedHomePath('en', 'en')).toBe('/');
  });

  it('os demais ficam sob o segmento', () => {
    expect(localizedSitePath('pt-BR', ref, 'en')).toBe('/pt-br/foundation/color/palette');
    expect(localizedSitePath('pt-BR', ref, 'en', 'uso')).toBe('/pt-br/foundation/color/palette/uso');
    expect(localizedHomePath('pt-BR', 'en')).toBe('/pt-br');
  });

  it('o padrão pode ser qualquer idioma', () => {
    expect(localizedSitePath('pt-BR', ref, 'pt-BR')).toBe('/foundation/color/palette');
    expect(localizedSitePath('en', ref, 'pt-BR')).toBe('/en/foundation/color/palette');
  });
});

describe('splitLocalePrefix', () => {
  it('separa o prefixo de um idioma não padrão', () => {
    expect(splitLocalePrefix('/pt-br/foundation/color', locales, 'en')).toEqual({ locale: 'pt-BR', rest: '/foundation/color' });
    expect(splitLocalePrefix('/es/', locales, 'en')).toEqual({ locale: 'es', rest: '/' });
    expect(splitLocalePrefix('/es', locales, 'en')).toEqual({ locale: 'es', rest: '/' });
    expect(splitLocalePrefix('pt-br/x', locales, 'en')).toEqual({ locale: 'pt-BR', rest: '/x' });
  });

  it('sem prefixo, o padrão com o caminho inteiro', () => {
    expect(splitLocalePrefix('/foundation/color', locales, 'en')).toEqual({ locale: 'en', rest: '/foundation/color' });
    expect(splitLocalePrefix('/', locales, 'en')).toEqual({ locale: 'en', rest: '/' });
    expect(splitLocalePrefix('', locales, 'en')).toEqual({ locale: 'en', rest: '/' });
  });

  it('prefixo desconhecido, do padrão ou com maiúsculas não é idioma', () => {
    expect(splitLocalePrefix('/fr/foundation', locales, 'en')).toEqual({ locale: 'en', rest: '/fr/foundation' });
    expect(splitLocalePrefix('/en/foundation', locales, 'en')).toEqual({ locale: 'en', rest: '/en/foundation' });
    expect(splitLocalePrefix('/pt-BR/foundation', locales, 'en')).toEqual({ locale: 'en', rest: '/pt-BR/foundation' });
    expect(splitLocalePrefix('/pt-brx/foundation', locales, 'en')).toEqual({ locale: 'en', rest: '/pt-brx/foundation' });
  });

  it('é o inverso de localizedSitePath', () => {
    for (const locale of locales) {
      const path = localizedSitePath(locale, ref, 'en', 'usage');
      expect(splitLocalePrefix(path, locales, 'en')).toEqual({ locale, rest: '/foundation/color/palette/usage' });
    }
  });
});

describe('hreflangLinks', () => {
  const traduzida = { menuSlug: 'fundamentos', sectionSlug: 'cor', pageSlug: 'paleta' };

  it('um por idioma, o padrão primeiro, mais x-default', () => {
    expect(hreflangLinks({ 'pt-BR': traduzida, en: ref }, 'en')).toEqual([
      { hreflang: 'en', path: '/foundation/color/palette' },
      { hreflang: 'pt-BR', path: '/pt-br/fundamentos/cor/paleta' },
      { hreflang: 'x-default', path: '/foundation/color/palette' },
    ]);
  });

  it('nada com um idioma só', () => {
    expect(hreflangLinks({ en: ref }, 'en')).toEqual([]);
    expect(hreflangLinks({}, 'en')).toEqual([]);
  });

  it('sem x-default se a página não está no padrão', () => {
    expect(hreflangLinks({ 'pt-BR': traduzida, es: ref }, 'en')).toEqual([
      { hreflang: 'pt-BR', path: '/pt-br/fundamentos/cor/paleta' },
      { hreflang: 'es', path: '/es/foundation/color/palette' },
    ]);
  });
});
