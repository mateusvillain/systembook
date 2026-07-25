import { cn } from '@/lib/utils';

/**
 * Pílula de tag de status (TASK-105) — rótulo colorido reutilizável. Usada na
 * página de gestão e, na TASK-106, no `SectionHeader` como seletor por página.
 *
 * A cor é um hex arbitrário escolhido pelo usuário, então o texto usa
 * preto/branco conforme a luminância percebida do fundo (fórmula sRGB) para
 * manter contraste legível em qualquer cor.
 */

/** Retorna '#000' ou '#fff' conforme a luminância do hex `#RRGGBB`. */
export function readableTextColor(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return '#000';
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Luminância relativa aproximada (coeficientes sRGB).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000' : '#fff';
}

export function StatusTagPill({
  titulo,
  cor,
  className,
}: {
  titulo: string;
  cor: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: cor, color: readableTextColor(cor) }}
    >
      {titulo}
    </span>
  );
}
