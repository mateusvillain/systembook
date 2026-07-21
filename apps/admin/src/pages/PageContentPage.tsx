import { useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, NavLink, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useTRPC } from '../lib/trpc.js';
import { ContentEditor, type ContentEditorHandle } from '../features/editor/ContentEditor.js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Superfície de edição de uma página (TASK-67). Edita o **corpo** da página (a
 * tab primária) em `/pages/:pageId`, ou uma tab de usuário em
 * `/pages/:pageId/tabs/:tabId`. A tab primária nunca aparece como tab de
 * usuário; o tab bar (Corpo + tabs) só aparece quando há ≥1 tab de usuário.
 * Publicar/Histórico são ações de página (nota da TASK-34).
 */
export function PageContentPage() {
  const { pageId, tabId } = useParams<{ pageId: string; tabId?: string }>();
  const trpc = useTRPC();
  const primary = useQuery(trpc.tabs.getPrimary.queryOptions({ pageId: pageId! }));
  const userTabs = useQuery(trpc.tabs.listByPage.queryOptions({ pageId: pageId! }));

  const editorRef = useRef<ContentEditorHandle>(null);
  // Publicar é um evento transiente → toast (convenção TASK-76). O indicador
  // de autosave segue inline (estado contínuo do editor, não vira toast).
  const publish = useMutation(
    trpc.pages.publish.mutationOptions({
      onSuccess: () => toast.success('Página publicada.'),
      onError: () => toast.error('Falha ao publicar. Tente novamente.'),
    }),
  );

  async function handlePublish() {
    // Garante que o rascunho da tab ativa está salvo antes do snapshot
    // (nota da TASK-34: o autosave continua independente do publish).
    await editorRef.current?.flush();
    publish.mutate({ pageId: pageId! });
  }

  if (primary.isPending || userTabs.isPending) return <p>Carregando…</p>;
  if (primary.isError || !primary.data) return <p role="alert">Página não encontrada.</p>;

  const tabs = userTabs.data ?? [];
  // Sem tabId na URL = editando o corpo (tab primária).
  const activeTabId = tabId ?? primary.data.id;
  const activeUserTab = tabId ? tabs.find((t) => t.id === tabId) : undefined;
  if (tabId && !activeUserTab) return <p role="alert">Tab não encontrada.</p>;

  const heading = activeUserTab ? activeUserTab.titulo : primary.data.titulo;

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="mt-0 text-2xl font-semibold">{heading}</h1>
        <div className="flex items-center gap-3">
          <Button asChild variant="link" className="px-0">
            <Link to={`/pages/${pageId}/history`}>Histórico</Link>
          </Button>
          <Button type="button" onClick={handlePublish} disabled={publish.isPending}>
            {publish.isPending ? 'Publicando…' : 'Publicar'}
          </Button>
        </div>
      </div>

      {/* Tab bar só quando há tabs de usuário: Corpo + as tabs (TASK-67). */}
      {tabs.length > 0 && (
        <nav aria-label="Visões da página" className="mb-4 flex gap-2 border-b">
          <PageViewLink to={`/pages/${pageId}`} end>
            Corpo
          </PageViewLink>
          {tabs.map((tab) => (
            <PageViewLink key={tab.id} to={`/pages/${pageId}/tabs/${tab.id}`}>
              {tab.titulo}
            </PageViewLink>
          ))}
        </nav>
      )}

      {/* key força instância nova do editor ao trocar de visão (TASK-25) */}
      <ContentEditor key={activeTabId} ref={editorRef} tabId={activeTabId} />
    </section>
  );
}

function PageViewLink({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          '-mb-px border-b-2 px-3 py-2 no-underline transition-colors',
          isActive
            ? 'border-primary text-primary font-semibold'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}
