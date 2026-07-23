import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { adminTypography } from '@/lib/typography';
import { cn } from '@/lib/utils';

/**
 * Empty State reutilizável (TASK-90, plano `# Componentes > Empty State`:
 * "ilustração simples · título · descrição · botão Adicionar conteúdo").
 *
 * A "ilustração" é um ícone lucide dentro de um círculo suave — sem pipeline
 * de SVG custom, consistente com o resto do admin. Título e descrição usam os
 * papéis tipográficos da TASK-82 (`adminTypography`), então o zero-state lê no
 * mesmo tom editorial do restante do redesign. A ação é um slot (`action`), de
 * modo que cada chamador conecta sua própria mutation (criar seção/página, abrir
 * o picker de blocos, etc.).
 *
 * `size='sm'` é a variação compacta para superfícies menores (dentro do editor,
 * dentro de um grupo de seção); usa degraus tipográficos menores, ainda dos
 * tokens da TASK-82.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'lg',
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  size?: 'lg' | 'sm';
  className?: string;
}) {
  const sm = size === 'sm';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sm ? 'gap-3 px-4 py-8' : 'gap-4 px-6 py-16',
        className,
      )}
    >
      <span
        className={cn(
          'bg-accent text-muted-foreground flex items-center justify-center rounded-full',
          sm ? 'size-10' : 'size-14',
        )}
      >
        <Icon className={sm ? 'size-5' : 'size-7'} strokeWidth={1.5} aria-hidden />
      </span>
      <div className="grid gap-1.5">
        <h2
          className={cn(
            sm ? cn(adminTypography.body, 'font-semibold') : adminTypography.title,
            'text-foreground',
          )}
        >
          {title}
        </h2>
        {description && (
          <p className={cn(sm ? adminTypography.metadata : adminTypography.description, 'mx-auto max-w-md')}>
            {description}
          </p>
        )}
      </div>
      {action && <div className={sm ? 'mt-0.5' : 'mt-1'}>{action}</div>}
    </div>
  );
}
