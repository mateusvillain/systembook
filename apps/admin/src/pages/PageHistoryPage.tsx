import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTRPC } from '../lib/trpc.js';
import { RevisionHistoryList } from '../features/revisions/RevisionHistoryList.js';
import { Button } from '@/components/ui/button';

/** Histórico de revisões de uma página (TASK-35): listar, prever e restaurar. */
export function PageHistoryPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const trpc = useTRPC();
  const tabs = useQuery(trpc.tabs.listByPage.queryOptions({ pageId: pageId! }));
  const firstTabId = tabs.data?.[0]?.id;

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Histórico de revisões</h1>
        {firstTabId && (
          <Button asChild variant="link" className="px-0">
            <Link to={`/pages/${pageId}/tabs/${firstTabId}`}>Voltar ao editor</Link>
          </Button>
        )}
      </div>
      <RevisionHistoryList pageId={pageId!} firstTabId={firstTabId} />
    </section>
  );
}
