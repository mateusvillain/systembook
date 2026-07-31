import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Plus, X } from 'lucide-react';
import { queryClient, useTRPC, type RouterOutput } from '../lib/trpc.js';
import { ContentEditor, type ContentEditorHandle } from '../features/editor/ContentEditor.js';
import { DraftPreviewDialog } from '../features/editor/DraftPreviewDialog.js';
import { SectionHeader } from '../features/editor/SectionHeader.js';
import { StatusTagSelector } from '../features/editor/StatusTagSelector.js';
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

  // Subtítulo/introdução (TASK-99): estado controlado + autosave debounced,
  // espelhando o padrão de rascunho do editor. Re-sincroniza só ao trocar de
  // página (deps no id) para não sobrescrever a digitação num refetch.
  const [subtitle, setSubtitle] = useState('');
  const subtitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSubtitulo = useMutation(trpc.pages.setSubtitulo.mutationOptions());
  useEffect(() => {
    setSubtitle(header.data?.page.subtitulo ?? '');
  }, [header.data?.page.id]);
  function handleSubtitleChange(value: string) {
    setSubtitle(value);
    if (subtitleTimer.current) clearTimeout(subtitleTimer.current);
    subtitleTimer.current = setTimeout(() => {
      if (pageId) setSubtitulo.mutate({ id: pageId, subtitulo: value });
    }, 600);
  }

  const editorRef = useRef<ContentEditorHandle>(null);
  // Publicar é um evento transiente → toast (convenção TASK-76). O indicador
  // de autosave segue inline (estado contínuo do editor, não vira toast).
  const publish = useMutation(
    trpc.pages.publish.mutationOptions({
      onSuccess: () => {
        toast.success('Page published.');
        // Atualiza status/metadados do Section Header (nova revisão publicada).
        queryClient.invalidateQueries(trpc.revisions.listByPage.queryFilter({ pageId: pageId! }));
        // E o indicador de rascunho pendente na árvore (SYS-68), que acabou de
        // deixar de valer para esta página.
        queryClient.invalidateQueries(trpc.pages.draftStatus.queryFilter());
      },
      onError: () => toast.error('Failed to publish. Try again.'),
    }),
  );
  const [checking, setChecking] = useState(false);

  // Preview do rascunho (SYS-58). O `flush` antes de abrir é o que sustenta o
  // critério "reflete o autosave mais recente": o autosave é debounced, então
  // sem ele o preview leria o estado de até 1s atrás.
  //
  // O botão **não** é desabilitado durante essa espera: `disabled` tira o foco
  // do elemento, e é para o elemento focado no momento da abertura que o Radix
  // devolve o foco ao fechar — com o disabled, sair do preview jogava o teclado
  // de volta no `<body>`, no topo da página. Abrir duas vezes é inofensivo (o
  // dialog já está aberto); perder o lugar do teclado não é.
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewButtonRef = useRef<HTMLButtonElement>(null);

  async function handlePreview() {
    await editorRef.current?.flush();
    setPreviewOpen(true);
  }

  async function handlePublish() {
    // Garante que o rascunho da tab ativa está salvo antes do snapshot
    // (nota da TASK-34: o autosave continua independente do publish).
    await editorRef.current?.flush();

    // Pré-checagem de embeds quebrados (SYS-61/62): avisa antes de publicar,
    // não bloqueia. `fetchQuery` com staleTime 0 porque o estado tem que ser
    // o de agora — o editor pode ter acabado de corrigir o bloco, e um cache
    // quente faria o aviso reaparecer para algo já resolvido.
    setChecking(true);
    let broken: BrokenEmbed[] = [];
    try {
      broken = await queryClient.fetchQuery({
        ...trpc.pages.validateEmbeds.queryOptions({ pageId: pageId! }),
        staleTime: 0,
      });
    } catch {
      // A checagem é um auxílio, não um portão: se ela mesma falhar, publicar
      // continua possível (o comportamento anterior a esta feature).
    } finally {
      setChecking(false);
    }

    if (broken.length > 0 && !window.confirm(brokenEmbedsWarning(broken))) return;

    publish.mutate({ pageId: pageId! });
  }

  if (primary.isPending || userTabs.isPending || header.isPending || revisions.isPending)
    return <p className="text-muted-foreground">Loading…</p>;
  if (primary.isError || !primary.data || header.isError || !header.data)
    return <p role="alert">Page not found.</p>;

  const tabs = userTabs.data ?? [];
  // Sem tabId na URL = editando o corpo (tab primária).
  const activeTabId = tabId ?? primary.data.id;
  const activeUserTab = tabId ? tabs.find((t) => t.id === tabId) : undefined;
  if (tabId && !activeUserTab) return <p role="alert">Tab not found.</p>;

  const { section, page } = header.data;
  // Metadados de publicação: a última revisão (listByPage vem em ordem desc).
  const revs = revisions.data ?? [];
  const published = revs.length > 0;
  const latest = revs[0];

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
    if (!window.confirm(`Delete the tab "${tab.titulo}" and its content?`)) return;
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
      <SectionHeader
        eyebrow={section.titulo}
        title={page.titulo}
        description={subtitle}
        onDescriptionChange={handleSubtitleChange}
        descriptionPlaceholder="Add an introduction (optional)"
        published={published}
        meta={{ updatedAt: latest?.criadoEm ?? null, author: latest?.autorEmail ?? null }}
        statusSlot={<StatusTagSelector pageId={page.id} statusTagId={page.statusTagId} />}
        actions={
          <>
            {/* Ordem por frequência e peso: conferir (Preview) vem antes de
                consultar o passado (History), e a ação irreversível (Publish)
                fica por último, sozinha como primária. */}
            <Button type="button" variant="ghost" ref={previewButtonRef} onClick={handlePreview}>
              Preview
            </Button>
            <Button asChild variant="ghost">
              <Link to={`/pages/${pageId}/history`}>History</Link>
            </Button>
            <Button type="button" onClick={handlePublish} disabled={publish.isPending || checking}>
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </Button>
          </>
        }
      />

      {/* Tab bar: Corpo + tabs de usuário. Com 0 tabs, só o gatilho "+ Aba". */}
      {tabs.length > 0 ? (
        <nav aria-label="Page views" className="-mt-2 flex flex-wrap items-center gap-1 border-b">
          <PageViewLink to={`/pages/${pageId}`} end>
            Body
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

      <DraftPreviewDialog
        pageId={pageId!}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        returnFocusRef={previewButtonRef}
      />
    </section>
  );
}

type BrokenEmbed = RouterOutput['pages']['validateEmbeds'][number];

/**
 * Texto do aviso de publicação com embeds quebrados (SYS-62). Cada `reason`
 * vira uma frase diferente porque a correção é diferente: variante não
 * escolhida o próprio editor resolve; artefato nunca buildado é conversa com
 * quem cuida do CI; artefato sumido indica problema de infra — e nesse caso
 * outras páginas provavelmente estão quebradas também.
 *
 * `window.confirm` (e não um dialog próprio) para ficar consistente com a
 * outra confirmação desta mesma tela (exclusão de tab) — o admin ainda não
 * tem primitiva de dialog.
 */
function brokenEmbedsWarning(broken: BrokenEmbed[]): string {
  // O servidor reporta por bloco (a UI precisa saber quais corrigir), mas a
  // mesma variante embutida N vezes na mesma tab renderia N linhas idênticas —
  // parece bug e não ajuda a distinguir. Agrupa e sufixa a contagem.
  const grupos = new Map<string, { linha: string; blocos: number }>();
  for (const e of broken) {
    const alvo = e.variantId ? `"${e.componentName}" (${e.variantId})` : `"${e.componentName}"`;
    const motivo = {
      'variant-unset': 'no variant selected yet',
      'no-publication': 'never built by the CI',
      'artifact-missing': 'the built files are gone from the server',
    }[e.reason];

    const linha = `• ${alvo} in "${e.tabTitulo}" — ${motivo}`;
    const grupo = grupos.get(linha);
    if (grupo) grupo.blocos += 1;
    else grupos.set(linha, { linha, blocos: 1 });
  }

  const lines = [...grupos.values()].map(({ linha, blocos }) =>
    blocos > 1 ? `${linha} (${blocos} blocks)` : linha,
  );

  const count =
    broken.length === 1
      ? '1 component preview on this page will not render:'
      : `${broken.length} component previews on this page will not render:`;

  return `${count}\n\n${lines.join('\n')}\n\nPublishing anyway shows a placeholder where the component should be.`;
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
          aria-label={`New title for tab ${tab.titulo}`}
          className="border-input min-w-0 rounded-editorial-sm border bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        />
        <button type="submit" className="text-muted-foreground hover:text-foreground p-1" aria-label="Save">
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground p-1"
          aria-label="Cancel"
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
        triggerLabel={`More actions for tab ${tab.titulo}`}
        onRename={() => {
          setDraft(tab.titulo);
          setEditing(true);
        }}
        onDelete={onDelete}
        onMovePrev={onMoveLeft}
        onMoveNext={onMoveRight}
        movePrevLabel="Move left"
        moveNextLabel="Move right"
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
        <Plus className="size-3.5" /> Tab
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn('flex items-center gap-1 px-2 py-1', !standalone && '-mb-px')}>
      <input
        autoFocus
        placeholder="Tab name"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label="New tab name"
        className="border-input w-32 min-w-0 rounded-editorial-sm border bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      />
      <button type="submit" className="text-muted-foreground hover:text-foreground p-1" aria-label="Create tab">
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground p-1"
        aria-label="Cancel"
        onClick={() => setOpen(false)}
      >
        <X className="size-3.5" />
      </button>
    </form>
  );
}
