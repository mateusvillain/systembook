import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTRPC } from '../lib/trpc.js';
import { ContentEditor } from '../features/editor/ContentEditor.js';

/** Conteúdo de uma tab: editor Tiptap (Fase 3, TASK-25+). */
export function TabContentPage() {
  const { pageId, tabId } = useParams<{ pageId: string; tabId: string }>();
  const trpc = useTRPC();
  const tabs = useQuery(trpc.tabs.listByPage.queryOptions({ pageId: pageId! }));
  const tab = tabs.data?.find((t) => t.id === tabId);

  if (tabs.isPending) return <p>Carregando…</p>;
  if (!tab) return <p role="alert">Tab não encontrada.</p>;

  return (
    <section>
      <h1 style={{ marginTop: 0 }}>{tab.titulo}</h1>
      {/* key força instância nova do editor ao trocar de tab (TASK-25) */}
      <ContentEditor key={tab.id} tabId={tab.id} />
    </section>
  );
}
