import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTRPC } from '../lib/trpc.js';
import { RevisionHistoryList } from '../features/revisions/RevisionHistoryList.js';

/** Histórico de revisões de uma página (TASK-35): listar, prever e restaurar. */
export function PageHistoryPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const trpc = useTRPC();
  const tabs = useQuery(trpc.tabs.listByPage.queryOptions({ pageId: pageId! }));
  const firstTabId = tabs.data?.[0]?.id;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ marginTop: 0 }}>Histórico de revisões</h1>
        {firstTabId && <Link to={`/pages/${pageId}/tabs/${firstTabId}`}>Voltar ao editor</Link>}
      </div>
      <RevisionHistoryList pageId={pageId!} firstTabId={firstTabId} />
    </section>
  );
}
