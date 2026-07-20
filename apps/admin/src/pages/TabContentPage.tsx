import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTRPC } from '../lib/trpc.js';
import { ContentEditor, type ContentEditorHandle } from '../features/editor/ContentEditor.js';

/** Conteúdo de uma tab: editor Tiptap (Fase 3, TASK-25+). */
export function TabContentPage() {
  const { pageId, tabId } = useParams<{ pageId: string; tabId: string }>();
  const trpc = useTRPC();
  const tabs = useQuery(trpc.tabs.listByPage.queryOptions({ pageId: pageId! }));
  const tab = tabs.data?.find((t) => t.id === tabId);

  const editorRef = useRef<ContentEditorHandle>(null);
  const [publishFeedback, setPublishFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const publish = useMutation(
    trpc.pages.publish.mutationOptions({
      onSuccess: () => setPublishFeedback({ type: 'success', text: 'Página publicada.' }),
      onError: () => setPublishFeedback({ type: 'error', text: 'Falha ao publicar. Tente novamente.' }),
    }),
  );

  async function handlePublish() {
    setPublishFeedback(null);
    // Garante que o rascunho da tab ativa está salvo antes do snapshot
    // (nota da TASK-34: o autosave continua independente do publish).
    await editorRef.current?.flush();
    publish.mutate({ pageId: pageId! });
  }

  if (tabs.isPending) return <p>Carregando…</p>;
  if (!tab) return <p role="alert">Tab não encontrada.</p>;

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ marginTop: 0 }}>{tab.titulo}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to={`/pages/${pageId}/history`}>Histórico</Link>
          <button type="button" onClick={handlePublish} disabled={publish.isPending}>
            {publish.isPending ? 'Publicando…' : 'Publicar'}
          </button>
        </div>
      </div>
      {publishFeedback && (
        <p
          role={publishFeedback.type === 'error' ? 'alert' : 'status'}
          style={{
            background: publishFeedback.type === 'error' ? '#fdecea' : '#e6f4ea',
            color: publishFeedback.type === 'error' ? '#b00020' : 'inherit',
            padding: '0.5rem 0.75rem',
            margin: '0 0 1rem',
          }}
        >
          {publishFeedback.text}
        </p>
      )}
      {/* key força instância nova do editor ao trocar de tab (TASK-25) */}
      <ContentEditor key={tab.id} ref={editorRef} tabId={tab.id} />
    </section>
  );
}
