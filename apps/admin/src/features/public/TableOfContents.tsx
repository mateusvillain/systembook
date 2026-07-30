import { useEffect, useState, type RefObject } from 'react';

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Slug ASCII-safe estável o bastante para âncora de heading (não precisa ser único globalmente, só dentro da página — a deduplicação fica a cargo de quem chama). */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/**
 * Sumário "Nesta página" (2.2): lê os headings h2/h3 já renderizados pelo
 * Tiptap read-only dentro de `containerRef` (via `PageRenderer`), atribui um
 * `id` estável a cada um (para âncora + scroll-spy) e mantém o item ativo
 * sincronizado com o scroll via `IntersectionObserver`. `watch` deve mudar
 * sempre que o conteúdo embaixo trocar (nova página ou tab) para forçar uma
 * nova varredura dos headings.
 */
export function TableOfContents({
  containerRef,
  watch,
}: {
  containerRef: RefObject<HTMLElement | null>;
  watch: string;
}) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cleanup: (() => void) | undefined;

    // O Tiptap monta o conteúdo num efeito próprio; um frame de folga evita
    // varrer o DOM antes dos headings existirem.
    const raf = requestAnimationFrame(() => {
      const headings = Array.from(container.querySelectorAll<HTMLHeadingElement>('h2, h3'));

      const seen = new Map<string, number>();
      const nextItems: TocItem[] = headings.map((heading) => {
        const text = heading.textContent?.trim() ?? '';
        const base = slugify(text);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        heading.id = id;
        return { id, text, level: heading.tagName === 'H2' ? 2 : 3 };
      });

      setItems(nextItems);
      setActiveId(nextItems[0]?.id ?? '');
      if (headings.length === 0) return;

      // O scroll é interno ao cartão branco (SYS-36), não da viewport — é dele
      // que vem o evento e é o topo dele que define a linha do "ativo".
      // `null` (janela) continua sendo o fallback fora do shell público.
      const scrollRoot = container.closest('.sb-public-content');

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

      cleanup = () => {
        if (queued) cancelAnimationFrame(queued);
        scrollTarget.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      };
    });

    return () => {
      cancelAnimationFrame(raf);
      cleanup?.();
    };
    // `watch` é o gatilho intencional de reescaneio; `containerRef` é estável entre renders.
  }, [watch]);

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
