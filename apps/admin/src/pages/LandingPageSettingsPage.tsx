import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc.js';
import { ContentEditor, type ContentEditorHandle } from '../features/editor/ContentEditor.js';

/**
 * Edição da página inicial da doc pública (TASK-56). Reusa o `ContentEditor`
 * comum (autosave incluído, TASK-32) apontado para a tab reservada da landing,
 * e publica via `pages.publish` com o page id reservado — a mesma máquina das
 * páginas normais, sem armazenamento paralelo. Disponível para admin e editor
 * (é conteúdo, como publicar páginas).
 */
export function LandingPageSettingsPage() {
  const trpc = useTRPC();
  const target = useQuery(trpc.landing.getEditorTarget.queryOptions());

  const editorRef = useRef<ContentEditorHandle>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const publish = useMutation(
    trpc.pages.publish.mutationOptions({
      onSuccess: () => setFeedback({ type: 'success', text: 'Página inicial publicada.' }),
      onError: () => setFeedback({ type: 'error', text: 'Falha ao publicar. Tente novamente.' }),
    }),
  );

  if (target.isPending) return <p>Carregando…</p>;
  if (!target.data) return <p role="alert">Não foi possível carregar a página inicial.</p>;

  const { pageId, tabId } = target.data;

  async function handlePublish() {
    setFeedback(null);
    await editorRef.current?.flush();
    publish.mutate({ pageId });
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ marginTop: 0 }}>Página inicial</h1>
        <button type="button" onClick={handlePublish} disabled={publish.isPending}>
          {publish.isPending ? 'Publicando…' : 'Publicar'}
        </button>
      </div>
      <p style={{ color: '#666', marginTop: 0 }}>
        Este é o conteúdo mostrado na raiz da documentação pública. Publique para
        que os visitantes vejam a nova versão.
      </p>
      {feedback && (
        <p
          role={feedback.type === 'error' ? 'alert' : 'status'}
          style={{
            background: feedback.type === 'error' ? '#fdecea' : '#e6f4ea',
            color: feedback.type === 'error' ? '#b00020' : 'inherit',
            padding: '0.5rem 0.75rem',
            margin: '0 0 1rem',
          }}
        >
          {feedback.text}
        </p>
      )}
      <ContentEditor key={tabId} ref={editorRef} tabId={tabId} />
    </section>
  );
}
