import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Helper padrão do shadcn/ui: combina classes condicionais + resolve conflitos
 * de utilities do Tailwind (ex.: `px-2 px-4` → `px-4`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
