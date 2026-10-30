// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setupDom } from '../../test/dom.js';
import { UiLocaleProvider, resolveUiLocale, useMessages, useUiLocale } from './UiLocale.js';

const dom = setupDom();

function Probe() {
  const t = useMessages();
  return (
    <p data-locale={useUiLocale()}>
      {t('toc.title')} | {t('search.placeholderNamed', { name: 'Acme' })}
    </p>
  );
}

describe('UiLocaleProvider (SYS-161)', () => {
  it('sem provider usa o inglês', () => {
    dom.render(<Probe />);
    expect(dom.container().textContent).toBe('On this page | Search Acme');
    expect(dom.container().querySelector('p')?.dataset.locale).toBe('en');
  });

  it('traduz no idioma do provider', () => {
    dom.render(
      <UiLocaleProvider locale="pt-BR">
        <Probe />
      </UiLocaleProvider>,
    );
    expect(dom.container().textContent).toBe('Nesta página | Buscar em Acme');
  });

  it('resolve o idioma base e cai no inglês sem dicionário', () => {
    dom.render(
      <UiLocaleProvider locale="pt-PT">
        <Probe />
      </UiLocaleProvider>,
    );
    expect(dom.container().querySelector('p')?.dataset.locale).toBe('pt-BR');

    dom.render(
      <UiLocaleProvider locale="fr">
        <Probe />
      </UiLocaleProvider>,
    );
    expect(dom.container().textContent).toBe('On this page | Search Acme');
  });
});

describe('resolveUiLocale (SYS-161)', () => {
  it('mapeia para um dicionário embutido', () => {
    expect(resolveUiLocale('pt')).toBe('pt-BR');
    expect(resolveUiLocale('es')).toBe('en');
    expect(resolveUiLocale(null)).toBe('en');
  });
});
