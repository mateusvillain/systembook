import { Check, Plus, X } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import { StatusTagPill } from '@/components/StatusTagPill';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Seletor de tag de status por página (TASK-106) — ao lado do título no
 * `SectionHeader`, no lugar do antigo selo automático "Rascunho"/"Publicado".
 * Mostra a tag atual (pílula) ou uma affordance "+ Status tag" quando vazia
 * (`referencia.png`). Clicar abre o dropdown com as tags gerenciadas
 * (TASK-105), na ordem da página de gestão, + a opção de limpar.
 */
export function StatusTagSelector({
  pageId,
  statusTagId,
}: {
  pageId: string;
  statusTagId: string | null;
}) {
  const trpc = useTRPC();
  const tags = useQuery(trpc.statusTags.list.queryOptions());
  const setStatusTag = useMutation(
    trpc.pages.setStatusTag.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.pages.header.queryFilter({ pageId })),
    }),
  );

  const list = tags.data ?? [];
  const current = statusTagId ? list.find((t) => t.id === statusTagId) : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={current ? `Status: ${current.titulo}. Change` : 'Set status'}
          className="inline-flex shrink-0 items-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          {current ? (
            <StatusTagPill titulo={current.titulo} cor={current.cor} />
          ) : (
            <span className="text-primary inline-flex items-center gap-1 rounded-full text-xs font-medium">
              <Plus className="size-3.5" />
              Status tag
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {list.map((tag) => (
          <DropdownMenuItem
            key={tag.id}
            onSelect={() => setStatusTag.mutate({ pageId, statusTagId: tag.id })}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: tag.cor }}
            />
            <span className="flex-1">{tag.titulo}</span>
            {tag.id === statusTagId && <Check className="size-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
        {list.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem
          disabled={statusTagId === null}
          onSelect={() => setStatusTag.mutate({ pageId, statusTagId: null })}
          className={cn('flex items-center gap-2 text-muted-foreground')}
        >
          <X className="size-3.5" />
          No status
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
