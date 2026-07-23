import type { ReactNode } from 'react';
import { Clock } from 'lucide-react';
import { adminTypography } from '../../lib/typography.js';
import { formatAbsolute, formatRelative } from '../../lib/dates.js';
import { cn } from '@/lib/utils';

/**
 * Section Header do editor (TASK-87, plano `# Área principal` / `# Hierarquia
 * tipográfica` e a `referencia.png`): faz a superfície ler como documento, não
 * formulário. Categoria (seção) › Título grande › Descrição opcional ›
 * Metadados (status/atualização/autor). As ações de página (Publicar/Histórico)
 * entram pelo slot `actions`, alinhadas ao título — contextuais à página,
 * nunca no header do app (regra da TASK-85).
 *
 * Só expõe metadados que existem no modelo: `pages`/`sections` não têm
 * timestamps, então data/autor vêm da última revisão publicada (`revisions`).
 * Não há campo de descrição por página hoje — `description` fica opcional e é
 * omitido até o modelo ganhar um (nota em technicalNotes da task).
 */
export interface SectionHeaderMeta {
  /** Data da última publicação (última revisão), ou null se nunca publicada. */
  updatedAt: Date | number | string | null;
  /** Autor da última revisão; null quando o usuário foi removido (autor_id SET NULL). */
  author: string | null;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  published,
  meta,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  published: boolean;
  meta: SectionHeaderMeta;
  actions?: ReactNode;
}) {
  return (
    <header className="grid gap-3">
      <p className={adminTypography.category}>{eyebrow}</p>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className={cn(adminTypography.title, 'mt-0 min-w-0 break-words')}>{title}</h1>
          <StatusTag published={published} />
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
      </div>

      {description && <p className={cn(adminTypography.description, 'mt-0 max-w-3xl')}>{description}</p>}

      <MetaRow published={published} meta={meta} />
    </header>
  );
}

/** Pílula de status: ponto colorido + rótulo, quieta (sem bloco de cor pesado). */
function StatusTag({ published }: { published: boolean }) {
  return (
    <span
      className="border-border text-muted-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      title={published ? 'Publicada ao menos uma vez' : 'Ainda não publicada'}
    >
      <span
        className={cn('size-1.5 rounded-full', published ? 'bg-emerald-500' : 'bg-amber-500')}
        aria-hidden
      />
      {published ? 'Publicado' : 'Rascunho'}
    </span>
  );
}

function MetaRow({ published, meta }: { published: boolean; meta: SectionHeaderMeta }) {
  return (
    <p className={cn(adminTypography.metadata, 'flex items-center gap-1.5')}>
      <Clock className="size-3.5 shrink-0 opacity-70" aria-hidden />
      {published && meta.updatedAt != null ? (
        <span>
          Atualizado{' '}
          <time dateTime={new Date(meta.updatedAt).toISOString()} title={formatAbsolute(meta.updatedAt)}>
            {formatRelative(meta.updatedAt)}
          </time>{' '}
          por {meta.author ?? 'usuário removido'}
        </span>
      ) : (
        <span>Nunca publicado</span>
      )}
    </p>
  );
}
