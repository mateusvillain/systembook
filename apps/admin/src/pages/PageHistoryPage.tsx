import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTRPC } from '../lib/trpc.js';
import { RevisionHistoryList } from '../features/revisions/RevisionHistoryList.js';
import { Button } from '@/components/ui/button';
import { useT } from '../i18n/AdminLocale.js';

/** Histórico de revisões de uma página (TASK-35): listar, prever e restaurar. */
export function PageHistoryPage() {
  const { pageId } = useParams<{ pageId: string }>();
  const trpc = useTRPC();
  const t = useT();
  const tabs = useQuery(trpc.tabs.listByPage.queryOptions({ pageId: pageId! }));
  const firstTabId = tabs.data?.[0]?.id;

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('history.title')}</h1>
        {firstTabId && (
          <Button asChild variant="link" className="px-0">
            <Link to={`/pages/${pageId}/tabs/${firstTabId}`}>{t('history.backToEditor')}</Link>
          </Button>
        )}
      </div>
      <RevisionHistoryList pageId={pageId!} firstTabId={firstTabId} />
    </section>
  );
}
