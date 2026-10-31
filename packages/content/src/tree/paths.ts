/** Utilitários de caminho compartilhados pela árvore base e pela traduzida. */

export const CONTENT_FILE = /\.(md|mdx)$/;
export const META_FILES = ['_menu.yml', '_section.yml'] as const;

/** `a\b`, `./a/b/`, `/a//b` → `a/b`. */
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}

/** Nome sem extensão e o formato do arquivo. */
export function splitName(name: string): { base: string; format: 'md' | 'mdx' } {
  const format = name.endsWith('.mdx') ? 'mdx' : 'md';
  return { base: name.slice(0, -(format.length + 1)), format };
}

export function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Ignorados: qualquer segmento que comece com `_` ou `.`, exceto os yml de meta no fim. */
export function isIgnored(segments: string[]): boolean {
  return segments.some(
    (segment, i) =>
      (segment.startsWith('_') || segment.startsWith('.')) &&
      !(i === segments.length - 1 && (META_FILES as readonly string[]).includes(segment)),
  );
}

/** Arquivo `.MD`/`.Mdx`: o erro em vez de a página sumir. */
export function uppercaseExtension(name: string): string | null {
  if (CONTENT_FILE.test(name) || !/\.(md|mdx)$/i.test(name)) return null;
  return `extensão em maiúsculas — renomeie para .${name.split('.').pop()!.toLowerCase()}.`;
}
