/**
 * Palavras de um caminho de token, para os renderers adivinharem o que um
 * `dimension` ou `number` mede (SYS-150/154): `acme.zIndex.modal`,
 * `z-index.modal` e `z_index.modal` → acme, z, index, modal.
 */
export function pathWords(path: string): string[] {
  return path
    .split('.')
    .flatMap((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[\s_-]+/),
    )
    .filter(Boolean);
}

/** Alguma das palavras. */
export const hasAny = (words: readonly string[], set: ReadonlySet<string>) => words.some((w) => set.has(w));

/** As duas palavras em sequência (`line height`, `z index`), ou a forma colada (`lineheight`, `zindex`). */
export const hasPair = (words: readonly string[], first: string, second: string) =>
  words.includes(`${first}${second}`) || words.some((w, i) => w === first && words[i + 1] === second);
