import { useEffect, useState, type RefObject } from 'react';

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Slug ASCII-safe estável o bastante para âncora de heading (não precisa ser único globalmente, só dentro da página — a deduplicação é feita aqui). */
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
 * Texto do heading **sem** os controles injetados nele (a âncora de link da
 * SYS-34 é um `<button>` filho do próprio heading). Sem esse filtro, um
 * reescaneio depois da primeira montagem leria o rótulo do botão como parte do
 * título e o slug mudaria — quebrando links já compartilhados.
 */
function headingText(heading: HTMLHeadingElement): string {
  let text = '';
  for (const node of heading.childNodes) {
    if (node instanceof HTMLElement && node.dataset.headingAnchor !== undefined) continue;
    text += node.textContent ?? '';
  }
  return text.trim();
}

/**
 * Varre os headings h2/h3 já renderizados pelo Tiptap read-only dentro de
 * `containerRef` e atribui a cada um um `id` estável — a base tanto do TOC
 * (SYS-19) quanto da âncora de link no próprio heading (SYS-34). Fica num hook
 * próprio para que os dois leiam a **mesma** lista: dois scans independentes
 * poderiam divergir na deduplicação de títulos repetidos.
 *
 * `watch` deve mudar sempre que o conteúdo embaixo trocar (nova página ou tab)
 * para forçar um novo scan.
 */
export function useHeadingIds(containerRef: RefObject<HTMLElement | null>, watch: string) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [headings, setHeadings] = useState<HTMLHeadingElement[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // O Tiptap monta o conteúdo num efeito próprio; um frame de folga evita
    // varrer o DOM antes dos headings existirem.
    const raf = requestAnimationFrame(() => {
      const found = Array.from(container.querySelectorAll<HTMLHeadingElement>('h2, h3'));

      const seen = new Map<string, number>();
      const nextItems: TocItem[] = found.map((heading) => {
        const text = headingText(heading);
        const base = slugify(text);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        heading.id = id;
        return { id, text, level: heading.tagName === 'H2' ? 2 : 3 };
      });

      setItems(nextItems);
      setHeadings(found);
    });

    return () => cancelAnimationFrame(raf);
    // `watch` é o gatilho intencional de reescaneio; `containerRef` é estável entre renders.
  }, [watch]);

  return { items, headings };
}
