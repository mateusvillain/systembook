import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Breadcrumbs do editor (TASK-87, plano `# Navegação`): Menu › Seção › Página ›
 * (Aba). Uma linha discreta acima do Section Header — orienta sem competir com
 * o título. O último segmento é o contexto atual (não clicável); os anteriores
 * navegam (Link) ou disparam uma ação (ex.: o Menu seleciona-se como ativo).
 */
export interface Crumb {
  label: string;
  to?: string;
  onClick?: () => void;
  current?: boolean;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
      {items.map((item, i) => (
        <Fragment key={`${item.label}-${i}`}>
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />}
          <Crumb item={item} last={i === items.length - 1} />
        </Fragment>
      ))}
    </nav>
  );
}

function Crumb({ item, last }: { item: Crumb; last: boolean }): ReactNode {
  const interactive = 'max-w-[16rem] truncate rounded-editorial-sm px-1 py-0.5 transition-colors hover:text-foreground hover:bg-accent';

  if (item.to) {
    return (
      <Link to={item.to} className={cn(interactive, 'no-underline')}>
        {item.label}
      </Link>
    );
  }
  if (item.onClick) {
    return (
      <button type="button" onClick={item.onClick} className={interactive}>
        {item.label}
      </button>
    );
  }
  // Segmento não navegável (ex.: seção, que não tem rota própria). O atual/último
  // ganha ênfase; os intermediários ficam quietos.
  const emphasized = item.current || last;
  return (
    <span
      className={cn('max-w-[16rem] truncate px-1 py-0.5', emphasized && 'text-foreground font-medium')}
      aria-current={emphasized ? 'page' : undefined}
    >
      {item.label}
    </span>
  );
}
