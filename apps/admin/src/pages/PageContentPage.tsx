import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, NavLink, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Plus, X } from 'lucide-react';
import { queryClient, useTRPC } from '../lib/trpc.js';
import { ContentEditor, type ContentEditorHandle } from '../features/editor/ContentEditor.js';
import { Breadcrumbs, type Crumb } from '../features/editor/Breadcrumbs.js';
import { SectionHeader } from '../features/editor/SectionHeader.js';
import type { AdminOutletContext } from '../components/AdminLayout.js';
import { Button } from '@/components/ui/button';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { createLinkClass } from '@/lib/styles';
import { cn } from '@/lib/utils';

/**
 * Superfície de edição de uma página (TASK-67). Edita o **corpo** da página (a
 * tab primária) em `/pages/:pageId`, ou uma tab de usuário em
 * `/pages/:pageId/tabs/:tabId`. A tab primária nunca aparece como tab de
 * usuário; o tab bar (Corpo + tabs) só aparece quando há ≥1 tab de usuário.
 * Publicar/Histórico são ações de página (nota da TASK-34).
 *
 * TASK-86: a gestão de tabs (criar/renomear/reordenar/excluir) saiu da árvore
 * da sidebar e vive **aqui**, no tab bar da página — o único ponto de acesso a
 * tabs agora. Quando não há tabs, um "+ Aba" discreto permite criar a primeira.
 */
export function PageContentPage() {
  const { pageId, tabId } = useParams<{ pageId: string; tabId?: string }>();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { setActiveMenuId } = useOutletContext<AdminOutletContext>();
  const primary = useQuery(trpc.tabs.getPrimary.queryOptions({ pageId: pageId! }));
  const userTabs = useQuery(trpc.tabs.listByPage.queryOptions({ pageId: pageId! }));
  // Cabeçalho (Menu › Seção › Página) e metadados de publicação (última revisão).
  const header = useQuery(trpc.pages.header.queryOptions({ pageId: pageId! }));
  const revisions = useQuery(trpc.revisions.listByPage.queryOptions({ pageId: pageId! }));

  const invalidateTabs = () =>
    queryClient.invalidateQueries(trpc.tabs.listByPage.queryFilter({ pageId: pageId! }));

  const createTab = useMutation(trpc.tabs.create.mutationOptions({ onSuccess: invalidateTabs }));
  const renameTab = useMutation(trpc.tabs.rename.mutationOptions({ onSuccess: invalidateTabs }));
  const reorderTab = useMutation(trpc.tabs.reorder.mutationOptions({ onSuccess: invalidateTabs }));
  const deleteTab = useMutation(trpc.tabs.delete.mutationOptions({ onSuccess: invalidateTabs }));

  const editorRef = useRef<ContentEditorHandle>(null);
  // Publicar é um evento transiente → toast (convenção TASK-76). O indicador
  // de autosave segue inline (estado contínuo do editor, não vira toast).
  const publish = useMutation(
    trpc.pages.publish.mutationOptions({
      onSuccess: () => {
        toast.success('Página publicada.');
        // Atualiza status/metadados do Section Header (nova revisão publicada).
        queryClient.invalidateQueries(trpc.revisions.listByPage.queryFilter({ pageId: pageId! }));
      },
      onError: () => toast.error('Falha ao publicar. Tente novamente.'),
    }),
  );

  async function handlePublish() {
    // Garante que o rascunho da tab ativa está salvo antes do snapshot
    // (nota da TASK-34: o autosave continua independente do publish).
    await editorRef.current?.flush();
    publish.mutate({ pageId: pageId! });
  }

  if (primary.isPending || userTabs.isPending || header.isPending || revisions.isPending)
    return <p className="text-muted-foreground">Carregando…</p>;
  if (primary.isError || !primary.data || header.isError || !header.data)
    return <p role="alert">Página não encontrada.</p>;

  const tabs = userTabs.data ?? [];
  // Sem tabId na URL = editando o corpo (tab primária).
  const activeTabId = tabId ?? primary.data.id;
  const activeUserTab = tabId ? tabs.find((t) => t.id === tabId) : undefined;
  if (tabId && !activeUserTab) return <p role="alert">Tab não encontrada.</p>;

  const { menu, section, page } = header.data;
  // Metadados de publicação: a última revisão (listByPage vem em ordem desc).
  const revs = revisions.data ?? [];
  const published = revs.length > 0;
  const latest = revs[0];

  // Menu › Seção › Página › (Aba). O Menu seleciona-se como ativo (TASK-85) e
  // leva à raiz; a Seção não tem rota própria (texto quieto); a Página vira link
  // quando há uma aba aberta, senão é o item atual.
  const crumbs: Crumb[] = [
    {
      label: menu.titulo,
      onClick: () => {
        setActiveMenuId(menu.id);
        navigate('/');
      },
    },
    { label: section.titulo },
    activeUserTab
      ? { label: page.titulo, to: `/pages/${pageId}` }
      : { label: page.titulo, current: true },
  ];
  if (activeUserTab) crumbs.push({ label: activeUserTab.titulo, current: true });

  async function handleCreateTab(titulo: string) {
    const tab = await createTab.mutateAsync({ pageId: pageId!, titulo });
    navigate(`/pages/${pageId}/tabs/${tab.id}`);
  }

  function moveTab(index: number, delta: -1 | 1) {
    const ids = tabs.map((t) => t.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    reorderTab.mutate({ pageId: pageId!, orderedIds: ids });
  }

  function handleDeleteTab(tab: { id: string; titulo: string }) {
    if (!window.confirm(`Excluir a aba "${tab.titulo}" e seu conteúdo?`)) return;
    deleteTab.mutate(
      { id: tab.id },
      {
        // Se a aba aberta foi excluída, volta para o corpo da página.
        onSuccess: () => {
          if (tabId === tab.id) navigate(`/pages/${pageId}`);
        },
      },
    );
  }

  return (
    <section className="grid gap-8">
      <div className="grid gap-4">
        <Breadcrumbs items={crumbs} />
        <SectionHeader
          eyebrow={section.titulo}
          title={page.titulo}
          published={published}
          meta={{ updatedAt: latest?.criadoEm ?? null, author: latest?.autorEmail ?? null }}
          actions={
            <>
              <Button asChild variant="ghost">
                <Link to={`/pages/${pageId}/history`}>Histórico</Link>
              </Button>
              <Button type="button" onClick={handlePublish} disabled={publish.isPending}>
                {publish.isPending ? 'Publicando…' : 'Publicar'}
              </Button>
            </>
          }
        />
      </div>

      {/* Tab bar: Corpo + tabs de usuário. Com 0 tabs, só o gatilho "+ Aba". */}
      {tabs.length > 0 ? (
        <nav aria-label="Visões da página" className="-mt-2 flex flex-wrap items-center gap-1 border-b">
          <PageViewLink to={`/pages/${pageId}`} end>
            Corpo
          </PageViewLink>
          {tabs.map((tab, i) => (
            <TabItem
              key={tab.id}
              to={`/pages/${pageId}/tabs/${tab.id}`}
              tab={tab}
              onRename={(titulo) => renameTab.mutate({ id: tab.id, titulo })}
              onDelete={() => handleDeleteTab(tab)}
              onMoveLeft={i > 0 ? () => moveTab(i, -1) : undefined}
              onMoveRight={i < tabs.length - 1 ? () => moveTab(i, 1) : undefined}
            />
          ))}
          <AddTab onCreate={handleCreateTab} />
        </nav>
      ) : (
        <div className="-mt-2">
          <AddTab onCreate={handleCreateTab} standalone />
        </div>
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

/** Uma tab de usuário no bar: link + ações (⋮) reveladas no hover. */
function TabItem({
  to,
  tab,
  onRename,
  onDelete,
  onMoveLeft,
  onMoveRight,
}: {
  to: string;
  tab: { id: string; titulo: string };
  onRename: (titulo: string) => void;
  onDelete: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.titulo);

  if (editing) {
    return (
      <form
        className="-mb-px flex items-center gap-1 px-2 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onRename(draft.trim());
          setEditing(false);
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Novo título da aba ${tab.titulo}`}
          className="border-input min-w-0 rounded-editorial-sm border bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        />
        <button type="submit" className="text-muted-foreground hover:text-foreground p-1" aria-label="Salvar">
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground p-1"
          aria-label="Cancelar"
          onClick={() => setEditing(false)}
        >
          <X className="size-3.5" />
        </button>
      </form>
    );
  }

  return (
    <span className="group/tab -mb-px flex items-center">
      <PageViewLink to={to}>{tab.titulo}</PageViewLink>
      <RowActionsMenu
        triggerLabel={`Mais ações da aba ${tab.titulo}`}
        onRename={() => {
          setDraft(tab.titulo);
          setEditing(true);
        }}
        onDelete={onDelete}
        onMovePrev={onMoveLeft}
        onMoveNext={onMoveRight}
        movePrevLabel="Mover para a esquerda"
        moveNextLabel="Mover para a direita"
        triggerClassName="-ml-2 mb-1 opacity-0 transition-opacity group-hover/tab:opacity-100 group-focus-within/tab:opacity-100"
      />
    </span>
  );
}

/** Gatilho "+ Aba" que expande para um input de título. */
function AddTab({
  onCreate,
  standalone,
}: {
  onCreate: (titulo: string) => Promise<unknown>;
  standalone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!titulo.trim()) return;
    await onCreate(titulo.trim());
    setTitulo('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(createLinkClass, 'px-2 py-1', !standalone && '-mb-px')}
      >
        <Plus className="size-3.5" /> Aba
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn('flex items-center gap-1 px-2 py-1', !standalone && '-mb-px')}>
      <input
        autoFocus
        placeholder="Nome da aba"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label="Nome da nova aba"
        className="border-input w-32 min-w-0 rounded-editorial-sm border bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      />
      <button type="submit" className="text-muted-foreground hover:text-foreground p-1" aria-label="Criar aba">
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground p-1"
        aria-label="Cancelar"
        onClick={() => setOpen(false)}
      >
        <X className="size-3.5" />
      </button>
    </form>
  );
}
