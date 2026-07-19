import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTRPC } from '../lib/trpc.js';

/** Destino do clique em uma tab na árvore; o editor Tiptap chega na Fase 3. */
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
      <p style={{ color: '#666' }}>O editor de conteúdo desta tab chega na Fase 3 (Tiptap).</p>
    </section>
  );
}
