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

    let cleanupObserver: (() => void) | undefined;

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

      // rootMargin negativo por baixo: um heading conta como "ativo" assim
      // que cruza a faixa superior da viewport, não só quando totalmente
      // visível — combina com a leitura de cima para baixo.
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting);
          if (visible.length === 0) return;
          const topmost = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
          );
          setActiveId(topmost.target.id);
        },
        { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
      );
      headings.forEach((heading) => observer.observe(heading));
      cleanupObserver = () => observer.disconnect();
    });

    return () => {
      cancelAnimationFrame(raf);
      cleanupObserver?.();
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
