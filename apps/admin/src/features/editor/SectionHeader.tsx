import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
  onDescriptionChange,
  descriptionPlaceholder,
  published,
  meta,
  actions,
  statusSlot,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  /**
   * Quando fornecido, a descrição vira um campo editável inline (TASK-99) no
   * lugar do `<p>` read-only, reusando `adminTypography.description` — a mesma
   * apresentação, sem duplicá-la. O call site debita/salva (debounce).
   */
  onDescriptionChange?: (value: string) => void;
  /** Placeholder do campo editável quando vazio (ex.: "Add an introduction…"). */
  descriptionPlaceholder?: string;
  published: boolean;
  meta: SectionHeaderMeta;
  actions?: ReactNode;
  /**
   * Controle de status ao lado do título (TASK-106): o seletor de tag de status
   * por página. Substituiu o antigo selo automático "Rascunho"/"Publicado" — o
   * estado de publicação segue implícito no botão "Publicar" e na MetaRow.
   */
  statusSlot?: ReactNode;
}) {
  return (
    <header className="grid gap-3">
      <p className={adminTypography.category}>{eyebrow}</p>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className={cn(adminTypography.title, 'mt-0 min-w-0 break-words')}>{title}</h1>
          {statusSlot}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
      </div>

      {onDescriptionChange ? (
        <DescriptionField
          value={description ?? ''}
          onChange={onDescriptionChange}
          placeholder={descriptionPlaceholder}
        />
      ) : (
        description && <p className={cn(adminTypography.description, 'mt-0 max-w-3xl')}>{description}</p>
      )}

      <MetaRow published={published} meta={meta} />
    </header>
  );
}

/**
 * Campo editável da introdução (TASK-99): `textarea` sem chrome que lê como o
 * `<p>` de descrição (mesma `adminTypography.description`), auto-cresce com o
 * conteúdo e mostra o placeholder atenuado quando vazio.
 */
function DescriptionField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label="Page introduction (optional)"
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        adminTypography.description,
        'mt-0 w-full max-w-3xl resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground/50 focus-visible:ring-0',
      )}
    />
  );
}

function MetaRow({ published, meta }: { published: boolean; meta: SectionHeaderMeta }) {
  return (
    <p className={cn(adminTypography.metadata, 'flex items-center gap-1.5')}>
      <Clock className="size-3.5 shrink-0 opacity-70" aria-hidden />
      {published && meta.updatedAt != null ? (
        <span>
          Updated{' '}
          <time dateTime={new Date(meta.updatedAt).toISOString()} title={formatAbsolute(meta.updatedAt)}>
            {formatRelative(meta.updatedAt)}
          </time>{' '}
          by {meta.author ?? 'removed user'}
        </span>
      ) : (
        <span>Never published</span>
      )}
    </p>
  );
}
