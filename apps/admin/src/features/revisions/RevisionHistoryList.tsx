import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import { RevisionSnapshotPreview } from './RevisionSnapshotPreview.js';

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

  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restore = useMutation(
    trpc.pages.restoreRevision.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.revisions.listByPage.queryFilter());
        if (firstTabId) navigate(`/pages/${pageId}/tabs/${firstTabId}`);
      },
      onError: () => setRestoreError('Falha ao restaurar a revisão. Tente novamente.'),
    }),
  );

  function handleRestore(revisionId: string) {
    // Confirmação obrigatória (mesmo padrão de window.confirm do SidebarTree,
    // TASK-23): restaurar sobrescreve o conteúdo ao vivo de cada tab.
    const ok = window.confirm(
      'Restaurar esta revisão substitui o conteúdo atual (rascunho) de todas as tabs da página pelo snapshot escolhido. Continuar?',
    );
    if (!ok) return;
    setRestoreError(null);
    restore.mutate({ pageId, revisionId });
  }

  if (list.isPending) return <p>Carregando histórico…</p>;
  if (list.isError) return <p role="alert">Erro ao carregar o histórico.</p>;
  if (list.data.length === 0) return <p>Nenhuma revisão publicada ainda.</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: '1.5rem' }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {list.data.map((rev) => (
          <li key={rev.id} style={{ border: '1px solid #ddd', borderRadius: 4 }}>
            <button
              type="button"
              onClick={() => setSelectedId(rev.id)}
              aria-pressed={rev.id === selectedId}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                border: 'none',
                background: rev.id === selectedId ? '#eef4ff' : 'white',
                cursor: 'pointer',
              }}
            >
              <strong>{new Date(rev.criadoEm).toLocaleString('pt-BR')}</strong>
              <div style={{ fontSize: '0.8rem', color: '#555' }}>{rev.autorEmail ?? 'Autor removido'}</div>
              {rev.mensagem && <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{rev.mensagem}</div>}
            </button>
            <div style={{ padding: '0 0.75rem 0.5rem' }}>
              <button type="button" onClick={() => handleRestore(rev.id)} disabled={restore.isPending}>
                {restore.isPending ? 'Restaurando…' : 'Restaurar'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div>
        {restoreError && (
          <p role="alert" style={{ color: '#b00020' }}>
            {restoreError}
          </p>
        )}
        {selectedId === null && <p>Selecione uma revisão à esquerda para ver o conteúdo.</p>}
        {selectedId !== null && preview.isPending && <p>Carregando conteúdo…</p>}
        {selectedId !== null && preview.isError && <p role="alert">Erro ao carregar o snapshot.</p>}
        {preview.data && <RevisionSnapshotPreview snapshot={preview.data.snapshot} />}
      </div>
    </div>
  );
}
