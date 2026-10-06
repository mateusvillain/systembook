// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsRoutesProvider } from './docsRoutes.js';
import { useInternalLinks } from './useInternalLinks.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Content({ hrefs, blank = true }: { hrefs: string[]; blank?: boolean }) {
  const onClick = useInternalLinks();
  const location = useLocation();
  return (
    <main onClickCapture={onClick}>
      <output>{location.pathname + location.hash}</output>
      {hrefs.map((href) => (
        <a key={href} href={href} target={blank ? '_blank' : undefined} rel="noopener">
          {href}
        </a>
      ))}
    </main>
  );
}

/** Monta sob `basename`/`prefix`, clica em `href` e devolve se o clique foi interceptado e a rota. */
async function click(href: string, { basename = '/', prefix = '', start = '/', blank = true } = {}) {
  // Root novo a cada clique: o MemoryRouter só lê `initialEntries` ao montar.
  act(() => root.unmount());
  container.replaceChildren();
  root = createRoot(container);
  // MemoryRouter (não o data router): no jsdom, o data router quebra ao
  // navegar (AbortSignal do jsdom × Request do Node).
  const tick = () => new Promise((r) => setTimeout(r, 0));
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`${basename.replace(/\/$/, '')}${start}`]} basename={basename.replace(/\/$/, '') || undefined}>
        <DocsRoutesProvider prefix={prefix}>
          <Content hrefs={[href]} blank={blank} />
        </DocsRoutesProvider>
      </MemoryRouter>,
    );
    await tick();
  });
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  await act(async () => {
    container.querySelector('a')!.dispatchEvent(event);
    await tick();
  });
  return { intercepted: event.defaultPrevented, at: container.querySelector('output')!.textContent };
}

describe('useInternalLinks', () => {
  it('link para outra página da doc navega pelo router, com âncora, mesmo com target _blank', async () => {
    expect(await click('/acme/foundation/color/palette#uso', { basename: '/acme/' })).toEqual({
      intercepted: true,
      at: '/foundation/color/palette#uso',
    });
    expect(await click('/foundation/color/palette', { basename: '/' })).toEqual({
      intercepted: true,
      at: '/foundation/color/palette',
    });
  });

  it('slug com ponto continua sendo rota', async () => {
    expect(await click('/acme/m/s/v1.2', { basename: '/acme/' })).toEqual({ intercepted: true, at: '/m/s/v1.2' });
  });

  it('a raiz da base leva à landing', async () => {
    expect(await click('/acme', { basename: '/acme/', start: '/x/y/z' })).toEqual({ intercepted: true, at: '/' });
  });

  it('não intercepta: externo, fora da base, arquivo, e fora das rotas da doc no modo CMS', async () => {
    expect((await click('https://example.com/x')).intercepted).toBe(false);
    expect((await click('/outro-repo/x', { basename: '/acme/' })).intercepted).toBe(false);
    expect((await click('/acme/guia.pdf', { basename: '/acme/' })).intercepted).toBe(false);
    expect((await click('/admin/users', { prefix: '/docs', start: '/docs' })).intercepted).toBe(false);
    expect(await click('/docs/m/s/p', { prefix: '/docs', start: '/docs' })).toEqual({ intercepted: true, at: '/docs/m/s/p' });
  });

  it('âncora da própria página: sem target, deixa para o handler do TOC; com _blank, rola no lugar', async () => {
    const target = document.createElement('h2');
    target.id = 'uso';
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    document.body.appendChild(target);
    try {
      // O TOC/heading tem handler próprio no `onClick`: interceptar aqui o engolia.
      expect(await click('#uso', { blank: false })).toEqual({ intercepted: false, at: '/' });
      expect(scrollIntoView).not.toHaveBeenCalled();

      // Link do conteúdo (`target="_blank"`): não abre aba nem navega no router.
      expect(await click('#uso')).toEqual({ intercepted: true, at: '/' });
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(location.hash).toBe('#uso');
    } finally {
      target.remove();
      history.replaceState(null, '', location.pathname);
    }
  });
});
