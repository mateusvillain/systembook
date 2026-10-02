import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Helper padrão do shadcn/ui: combina classes condicionais e resolve conflitos
 * de utilities do Tailwind (`px-2 px-4` → `px-4`). Versão do pacote, sem os
 * tokens tipográficos do painel admin — a doc pública não os usa.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
