import { describe, expect, it } from 'vitest';
import { renderHtml } from './html.js';

describe('renderHtml', () => {
  const template = '<title>%SYSTEMBOOK_TITLE%</title><meta name="description" content="%SYSTEMBOOK_DESCRIPTION%" />';

  it('escapa o texto e não trata `$` como padrão do replace', () => {
    expect(renderHtml(template, { title: `Preço $' & <b>`, description: 'a "$&" b' })).toBe(
      '<title>Preço $\' &amp; &lt;b&gt;</title><meta name="description" content="a &quot;$&amp;&quot; b" />',
    );
  });

  it('lang da rota (ou o padrão) e as tags de idioma antes do </head>, com a base', () => {
    const page = '<html lang="%SYSTEMBOOK_LANG%"><head><title>%SYSTEMBOOK_TITLE%</title></head></html>';
    expect(renderHtml(page, { title: 'T', description: 'D' }, { lang: 'pt-BR' })).toBe('<html lang="pt-BR"><head><title>T</title></head></html>');
    expect(
      renderHtml(
        page,
        {
          title: 'T',
          description: 'D',
          locale: 'pt-BR',
          links: [
            { rel: 'alternate', hreflang: 'en', path: '/a"b' },
            { rel: 'canonical', path: '/c' },
          ],
        },
        { base: '/repo/', lang: 'en' },
      ),
    ).toBe(
      '<html lang="pt-BR"><head><title>T</title>    <link rel="alternate" hreflang="en" href="/repo/a&quot;b" />\n    <link rel="canonical" href="/repo/c" />\n</head></html>',
    );
  });
});
