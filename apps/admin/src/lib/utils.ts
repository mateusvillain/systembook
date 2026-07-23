import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge não conhece os tamanhos tipográficos editoriais da Fase 10
 * (`text-admin-*`, definidos em `@theme` no index.css). Sem isto ele classifica
 * `text-admin-title` como uma cor (grupo `text-color`) e, ao combinar com
 * `text-foreground` via `cn()`, descarta o tamanho — o título caía para o
 * default `2em` do UA. Registramos esses tokens no grupo `font-size` para que
 * `adminTypography.*` (que junta um `text-<tamanho>` + `text-<cor>`) sobreviva
 * a `cn()` em qualquer lugar (TASK-87).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['admin-eyebrow', 'admin-title', 'admin-description', 'admin-metadata', 'admin-body'] },
      ],
    },
  },
});

/** Helper padrão do shadcn/ui: combina classes condicionais + resolve conflitos
 * de utilities do Tailwind (ex.: `px-2 px-4` → `px-4`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
