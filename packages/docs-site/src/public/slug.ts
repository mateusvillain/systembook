/**
 * Slug ASCII-safe para âncoras da doc pública. Não precisa ser único
 * globalmente, só dentro da página — a deduplicação é de quem chama.
 *
 * Compartilhado entre `useHeadingIds` (SYS-19/34) e `useBlockAnchorIds`
 * (SYS-73): duas cópias da regra de slug é exatamente como links já
 * compartilhados começam a divergir entre si.
 */
export function slugify(text: string, fallback: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}
