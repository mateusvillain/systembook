import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import { RevisionSnapshotPreview } from './RevisionSnapshotPreview.js';
import { RevisionDiffView } from './RevisionDiffView.js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
 *
 * SYS-60: cada linha ganhou uma checkbox "Compare". Com duas marcadas, o painel
 * da direita troca o preview de uma revisão pelo **diff** entre as duas.
 *
 * **Por que checkbox e não um modo de comparação.** Ver uma revisão e comparar
 * duas são a mesma tarefa em momentos diferentes ("o que tinha aqui?" leva a
 * "o que mudou desde então?"). Um botão "Modo comparar" obrigaria a declarar a
 * intenção antes de ter a pergunta, e a marcar tudo de novo ao sair do modo;
 * a checkbox convive com o clique que já existia — clicar na linha continua
 * abrindo aquela revisão, marcar acumula para a comparação.
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

  /**
   * Revisões marcadas para comparar, **na ordem em que foram marcadas** — é ela
   * que define a direção do diff (a 1ª é o "de", a 2ª é o "para"), e é por isso
   * que é uma lista e não um `Set`. Marcar uma terceira derruba a mais antiga
   * da fila: é o que quem está varrendo o histórico quer (comparar a próxima
   * contra a que acabou de olhar) e evita um estado morto de "desmarque algo
   * antes de continuar".
   */
  const [compareIds, setCompareIds] = useState<string[]>([]);

  function toggleCompare(revisionId: string) {
    setCompareIds((current) =>
      current.includes(revisionId)
        ? current.filter((id) => id !== revisionId)
        : [...current, revisionId].slice(-2),
    );
  }

  const [fromId, toId] = compareIds.length === 2 ? compareIds : [null, null];

  /**
   * No mobile as duas colunas viram uma, e o diff nasce **abaixo da lista
   * inteira** — marcar a segunda revisão parecia não fazer nada, porque o
   * resultado ficava umas telas adiante. Ao completar o par, traz o painel para
   * a vista. Só no empilhado: no desktop o diff já está ao lado, e um scroll
   * automático ali seria movimento sem motivo. Respeita `prefers-reduced-motion`
   * (salta em vez de deslizar).
   */
  const diffPanelRef = useRef<HTMLDivElement>(null);
  const ready = compareIds.length === 2;
  useEffect(() => {
    if (!ready || !diffPanelRef.current) return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    diffPanelRef.current.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [ready, fromId, toId]);

  const restore = useMutation(
    trpc.pages.restoreRevision.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.revisions.listByPage.queryFilter());
        // O restore encadeia uma revisão nova: o rascunho volta a coincidir com
        // o publicado e o ponto da árvore (SYS-68) sai.
        queryClient.invalidateQueries(trpc.pages.draftStatus.queryFilter());
        toast.success('Revision restored.');
        if (firstTabId) navigate(`/pages/${pageId}/tabs/${firstTabId}`);
      },
      onError: () => toast.error('Failed to restore the revision. Try again.'),
    }),
  );

  function handleRestore(revisionId: string) {
    // Confirmação obrigatória (mesmo padrão de window.confirm do SidebarTree,
    // TASK-23): restaurar sobrescreve o conteúdo ao vivo de cada tab.
    const ok = window.confirm(
      'Restoring this revision replaces the current (draft) content of all page tabs with the chosen snapshot. Continue?',
    );
    if (!ok) return;
    restore.mutate({ pageId, revisionId });
  }

  if (list.isPending) return <p className="text-muted-foreground">Loading history…</p>;
  if (list.isError) return <p role="alert" className="text-destructive">Failed to load the history.</p>;
  if (list.data.length === 0) return <p className="text-muted-foreground">No revisions published yet.</p>;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(260px,340px)_1fr]">
      <div className="grid gap-2">
        {/* A instrução aparece só enquanto comparar ainda não é possível (0 ou 1
            marcada). Com o diff na tela, ela viraria ruído explicando algo que
            já está acontecendo. */}
        {list.data.length > 1 && compareIds.length < 2 && (
          <p className="text-muted-foreground text-xs">
            {compareIds.length === 0
              ? 'Tick two revisions to compare them.'
              : 'Tick one more revision to see what changed.'}
          </p>
        )}

        {/* `content-start`: num grid, as linhas `auto` esticam para preencher a
            altura do container — com o painel de diff alto ao lado, cada card de
            revisão virava um retângulo quase vazio. */}
        <ul className="grid list-none content-start gap-2 p-0">
          {list.data.map((rev) => {
            const comparing = compareIds.includes(rev.id);
            const role = comparing ? (compareIds[0] === rev.id ? 'From' : 'To') : null;

            return (
              <li
                key={rev.id}
                className={cn(
                  'overflow-hidden rounded-md border transition-colors',
                  comparing && 'border-primary/60',
                )}
              >
                <div className="flex items-start gap-2 px-3 pt-2">
                  <Checkbox
                    id={`compare-${rev.id}`}
                    checked={comparing}
                    onCheckedChange={() => toggleCompare(rev.id)}
                    className="mt-0.5"
                    aria-label={`Compare the revision from ${new Date(rev.criadoEm).toLocaleString('en-US')}`}
                  />
                  {/* O papel de cada marcada é dito por texto, não pela ordem
                      visual: a lista é cronológica e a direção do diff não. */}
                  <label
                    htmlFor={`compare-${rev.id}`}
                    className="text-muted-foreground cursor-pointer text-xs select-none"
                  >
                    {role ? `Comparing · ${role}` : 'Compare'}
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedId(rev.id)}
                  aria-pressed={rev.id === selectedId}
                  className={cn(
                    'block w-full px-3 py-2 text-left transition-colors',
                    rev.id === selectedId ? 'bg-accent' : 'hover:bg-muted/50',
                  )}
                >
                  <strong>{new Date(rev.criadoEm).toLocaleString('en-US')}</strong>
                  <div className="text-muted-foreground text-xs">{rev.autorEmail ?? 'Removed author'}</div>
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
                    {restore.isPending ? 'Restoring…' : 'Restore'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div ref={diffPanelRef} className="scroll-mt-4">
        {/* A comparação tem precedência sobre o preview de uma revisão só:
            marcar a segunda checkbox é uma ação mais recente e mais específica
            que o clique que abriu a revisão da esquerda. */}
        {fromId && toId ? (
          <RevisionDiffView
            fromRevisionId={fromId}
            toRevisionId={toId}
            onSwap={() => setCompareIds((current) => [...current].reverse())}
            onClear={() => setCompareIds([])}
          />
        ) : (
          <>
            {selectedId === null && (
              <p className="text-muted-foreground">Select a revision on the left to view its content.</p>
            )}
            {selectedId !== null && preview.isPending && <p className="text-muted-foreground">Loading content…</p>}
            {selectedId !== null && preview.isError && <p role="alert" className="text-destructive">Failed to load the snapshot.</p>}
            {preview.data && <RevisionSnapshotPreview snapshot={preview.data.snapshot} />}
          </>
        )}
      </div>
    </div>
  );
}
