import { useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTRPC } from '../lib/trpc.js';
import { ContentEditor, type ContentEditorHandle } from '../features/editor/ContentEditor.js';
import { Button } from '@/components/ui/button';

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
  const publish = useMutation(
    trpc.pages.publish.mutationOptions({
      onSuccess: () => toast.success('Página inicial publicada.'),
      onError: () => toast.error('Falha ao publicar. Tente novamente.'),
    }),
  );

  if (target.isPending) return <p className="text-muted-foreground">Carregando…</p>;
  if (!target.data) return <p role="alert" className="text-destructive">Não foi possível carregar a página inicial.</p>;

  const { pageId, tabId } = target.data;

  async function handlePublish() {
    await editorRef.current?.flush();
    publish.mutate({ pageId });
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Página inicial</h1>
        <Button type="button" onClick={handlePublish} disabled={publish.isPending}>
          {publish.isPending ? 'Publicando…' : 'Publicar'}
        </Button>
      </div>
      <p className="text-muted-foreground mt-1 mb-4 text-sm">
        Este é o conteúdo mostrado na raiz da documentação pública. Publique para que os visitantes
        vejam a nova versão.
      </p>
      <ContentEditor key={tabId} ref={editorRef} tabId={tabId} />
    </section>
  );
}
