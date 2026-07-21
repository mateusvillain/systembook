import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import { RevisionSnapshotPreview } from './RevisionSnapshotPreview.js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  pageId: string;
  /** Tab para onde navegar após um restore bem-sucedido (primeira tab da página, se houver). */
  firstTabId: string | undefined;
}

/**
 * Lista de revisões de uma página (TASK-35) — mais recentes primeiro, com
 * preview read-only ao selecionar e ação de restaurar (TASK-36) com
 * confirmação, já que sobrescreve o rascunho/blocks atuais de cada tab.
 */
export function RevisionHistoryList({ pageId, firstTabId }: Props) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useQuery(trpc.revisions.listByPage.queryOptions({ pageId }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const preview = useQuery({
    ...trpc.revisions.getById.queryOptions({ id: selectedId ?? '' }),
    enabled: selectedId !== null,
  });

  const restore = useMutation(
    trpc.pages.restoreRevision.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.revisions.listByPage.queryFilter());
        toast.success('Revisão restaurada.');
        if (firstTabId) navigate(`/pages/${pageId}/tabs/${firstTabId}`);
      },
      onError: () => toast.error('Falha ao restaurar a revisão. Tente novamente.'),
    }),
  );

  function handleRestore(revisionId: string) {
    // Confirmação obrigatória (mesmo padrão de window.confirm do SidebarTree,
    // TASK-23): restaurar sobrescreve o conteúdo ao vivo de cada tab.
    const ok = window.confirm(
      'Restaurar esta revisão substitui o conteúdo atual (rascunho) de todas as tabs da página pelo snapshot escolhido. Continuar?',
    );
    if (!ok) return;
    restore.mutate({ pageId, revisionId });
  }

  if (list.isPending) return <p className="text-muted-foreground">Carregando histórico…</p>;
  if (list.isError) return <p role="alert" className="text-destructive">Erro ao carregar o histórico.</p>;
  if (list.data.length === 0) return <p className="text-muted-foreground">Nenhuma revisão publicada ainda.</p>;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(260px,340px)_1fr]">
      <ul className="grid list-none gap-2 p-0">
        {list.data.map((rev) => (
          <li key={rev.id} className="overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => setSelectedId(rev.id)}
              aria-pressed={rev.id === selectedId}
              className={cn(
                'block w-full px-3 py-2 text-left transition-colors',
                rev.id === selectedId ? 'bg-accent' : 'hover:bg-muted/50',
              )}
            >
              <strong>{new Date(rev.criadoEm).toLocaleString('pt-BR')}</strong>
              <div className="text-muted-foreground text-xs">{rev.autorEmail ?? 'Autor removido'}</div>
              {rev.mensagem && <div className="mt-1 text-sm">{rev.mensagem}</div>}
            </button>
            <div className="px-3 pb-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleRestore(rev.id)}
                disabled={restore.isPending}
              >
                {restore.isPending ? 'Restaurando…' : 'Restaurar'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div>
        {selectedId === null && (
          <p className="text-muted-foreground">Selecione uma revisão à esquerda para ver o conteúdo.</p>
        )}
        {selectedId !== null && preview.isPending && <p className="text-muted-foreground">Carregando conteúdo…</p>}
        {selectedId !== null && preview.isError && <p role="alert" className="text-destructive">Erro ao carregar o snapshot.</p>}
        {preview.data && <RevisionSnapshotPreview snapshot={preview.data.snapshot} />}
      </div>
    </div>
  );
}
