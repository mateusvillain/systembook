import { useEffect, useState } from 'react';
import type { TocItem } from './useHeadingIds.js';

export type { TocItem } from './useHeadingIds.js';

/**
 * Sumário "On this page" (2.2): lista os headings h2/h3 do conteúdo e mantém o
 * item ativo sincronizado com o scroll. Os `id` dos headings — a base das
 * âncoras — vêm de `useHeadingIds` (SYS-34), chamado por quem renderiza os dois
 * consumidores, para que TOC e âncoras leiam a mesma lista.
 */
export function TableOfContents({ items, headings }: { items: TocItem[]; headings: HTMLHeadingElement[] }) {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    if (headings.length === 0) return;

    // O scroll é interno ao cartão branco (SYS-36), não da viewport — é dele
    // que vem o evento e é o topo dele que define a linha do "ativo".
    // `null` (janela) continua sendo o fallback fora do shell público.
    const scrollRoot = headings[0]!.closest('.sb-public-content');

    // O ativo é derivado da geometria a cada scroll, não de um
    // `IntersectionObserver`. O observer só dispara quando algum heading
    // *muda* de estado de interseção: um salto instantâneo de scroll (âncora,
    // Page Down, restauração de posição) que caia numa faixa sem nenhum
    // heading cruzando não gera callback nenhum, e o ativo **congela** no
    // item anterior. Ler os rects num handler de scroll é O(headings) por
    // quadro, com dezenas de headings no pior caso — mais barato que o bug.
    const ACTIVE_LINE = 24; // px abaixo do topo do container de scroll

    function recompute() {
      const rootTop = (scrollRoot ?? document.documentElement).getBoundingClientRect().top;
      const line = rootTop + ACTIVE_LINE;
      // Último heading que já passou da linha; antes do primeiro, o primeiro
      // (uma página aberta no topo mostra o primeiro item destacado). Cobre
      // também o trecho final longo sem headings, que antes congelava.
      let current = headings[0]!;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > line) break;
        current = heading;
      }
      setActiveId(current.id);
    }

    // `rAF` como throttle: o scroll dispara muito mais que uma vez por
    // quadro, e ler `getBoundingClientRect` em cada evento forçaria layout.
    let queued = 0;
    function onScroll() {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        recompute();
      });
    }

    const scrollTarget: EventTarget = scrollRoot ?? window;
    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    recompute();

    return () => {
      if (queued) cancelAnimationFrame(queued);
      scrollTarget.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [headings]);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    setActiveId(id);
  }

  if (items.length === 0) return null;

  return (
    <nav className="sb-toc" aria-label="Table of contents">
      <p className="sb-toc-title">On this page</p>
      <ul className="sb-toc-list">
        {items.map((item) => (
          <li key={item.id} className={`sb-toc-item sb-toc-item-h${item.level}`}>
            <a
              href={`#${item.id}`}
              className={`sb-toc-link${item.id === activeId ? ' active' : ''}`}
              onClick={(e) => handleClick(e, item.id)}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
