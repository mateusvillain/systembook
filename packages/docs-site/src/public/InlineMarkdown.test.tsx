import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InlineMarkdown } from './InlineMarkdown.js';

describe('InlineMarkdown', () => {
  it('renderiza marks inline sem deixar os marcadores', () => {
    const html = renderToStaticMarkup(<InlineMarkdown>{"**Let's UI** é `css` e [aberto](/guia)"}</InlineMarkdown>);
    expect(html).toBe('<strong>Let&#x27;s UI</strong> é <code>css</code> e <a href="/guia">aberto</a>');
  });
});
