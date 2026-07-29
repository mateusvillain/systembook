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

      // O scroll é interno ao cartão branco (SYS-36), não da viewport — o
      // observer precisa desse elemento como `root`, senão a interseção é
      // medida contra a viewport (onde tudo está sempre visível) e o
      // scroll-spy congela no primeiro heading. `null` (viewport) continua
      // sendo o fallback correto fora do shell público.
      const scrollRoot = container.closest('.sb-public-content');

      // rootMargin negativo por baixo: um heading conta como "ativo" assim
      // que cruza a faixa superior do container, não só quando totalmente
      // visível — combina com a leitura de cima para baixo.
      //
      // O estado de interseção é acumulado num `Set` em vez de lido só do
      // batch de `entries`: um callback traz apenas o que *mudou*, então
      // decidir o ativo pelo batch erra sempre que um heading continua na
      // faixa mas não é re-reportado (salto de scroll, dois headings
      // cruzando juntos). E quando nada está na faixa — o trecho final da
      // página, longo e sem headings — o ativo é o último já ultrapassado,
      // em vez de congelar no anterior.
      const intersecting = new Set<Element>();
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) intersecting.add(entry.target);
            else intersecting.delete(entry.target);
          }

          const topmost = headings.find((heading) => intersecting.has(heading));
          if (topmost) {
            setActiveId(topmost.id);
            return;
          }

          const rootTop = (scrollRoot ?? document.documentElement).getBoundingClientRect().top;
          const passed = headings.filter((heading) => heading.getBoundingClientRect().top < rootTop);
          const last = passed[passed.length - 1];
          if (last) setActiveId(last.id);
        },
        { root: scrollRoot, rootMargin: '-24px 0px -70% 0px', threshold: 0 },
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
