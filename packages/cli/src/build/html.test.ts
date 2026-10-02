import { describe, expect, it } from 'vitest';
import { renderHtml } from './html.js';

describe('renderHtml', () => {
  const template = '<title>%SYSTEMBOOK_TITLE%</title><meta name="description" content="%SYSTEMBOOK_DESCRIPTION%" />';

  it('escapa o texto e não trata `$` como padrão do replace', () => {
    expect(renderHtml(template, { title: `Preço $' & <b>`, description: 'a "$&" b' })).toBe(
      '<title>Preço $\' &amp; &lt;b&gt;</title><meta name="description" content="a &quot;$&amp;&quot; b" />',
    );
  });
});
