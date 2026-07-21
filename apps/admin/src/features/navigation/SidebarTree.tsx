import { useState, type FormEvent, type ReactNode } from 'react';
import { TRPCClientError } from '@trpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import { cn } from '@/lib/utils';

/**
 * Árvore de navegação (TASK-23): sections → pages → tabs, com criar/renomear/
 * reordenar/excluir inline em cada nível. Reordenação usa botões ↑/↓ enviando
 * a lista completa de ids ao `reorder` (drag-and-drop fica para depois).
 * Exclusão confirma via window.confirm — o delete cascateia toda a subárvore.
 * Fase 9 (TASK-78): estilo migrado para Tailwind + ícones lucide (só
 * apresentação — a lógica de query/mutation/reorder é intocada).
 */

const rowClass = 'flex items-center gap-1 rounded px-1 py-0.5';
const iconBtnClass =
  'inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors';
const treeInputClass =
  'min-w-0 flex-1 rounded border border-input bg-transparent px-2 py-0.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';

const treeNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn('min-w-0 flex-1 truncate rounded px-1 py-0.5 no-underline hover:bg-accent', isActive ? 'text-primary font-semibold' : 'text-foreground');

export function SidebarTree() {
  const trpc = useTRPC();
  const sectionsQuery = useQuery(trpc.sections.list.queryOptions());
  const invalidate = () => queryClient.invalidateQueries(trpc.sections.list.queryFilter());

  const create = useMutation(trpc.sections.create.mutationOptions({ onSuccess: invalidate }));
  const rename = useMutation(trpc.sections.rename.mutationOptions({ onSuccess: invalidate }));
  const reorder = useMutation(trpc.sections.reorder.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.sections.delete.mutationOptions({ onSuccess: invalidate }));

  const sections = sectionsQuery.data ?? [];

  function move(index: number, delta: -1 | 1) {
    const ids = sections.map((s) => s.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    reorder.mutate({ orderedIds: ids });
  }

  return (
    <nav
      aria-label="Estrutura da documentação"
      className="grid content-start gap-1 text-sm"
    >
      <strong className="text-muted-foreground px-1 py-0.5 text-xs tracking-wide">ESTRUTURA</strong>
      {sectionsQuery.isPending && <span className={cn(rowClass, 'text-muted-foreground')}>Carregando…</span>}
      {sections.map((section, i) => (
        <SectionNode
          key={section.id}
          section={section}
          onRename={(titulo) => rename.mutate({ id: section.id, titulo })}
          onDelete={() => {
            if (
              window.confirm(
                `Excluir a seção "${section.titulo}"? Todas as páginas e tabs dentro dela também serão removidas.`,
              )
            ) {
              remove.mutate({ id: section.id });
            }
          }}
          onMoveUp={i > 0 ? () => move(i, -1) : undefined}
          onMoveDown={i < sections.length - 1 ? () => move(i, 1) : undefined}
        />
      ))}
      <InlineCreate label="Nova seção" onCreate={(titulo) => create.mutateAsync({ titulo })} />
    </nav>
  );
}

interface NodeShape {
  id: string;
  titulo: string;
}

function SectionNode({
  section,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  section: NodeShape;
  onRename: (titulo: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <NodeRow
        title={section.titulo}
        label={`seção ${section.titulo}`}
        onRename={onRename}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        titleElement={
          <button
            className="flex flex-1 items-center gap-1 rounded px-1 py-0.5 text-left font-semibold hover:bg-accent"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Recolher' : 'Expandir'} seção ${section.titulo}`}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
            {section.titulo}
          </button>
        }
      />
      {expanded && <PagesList sectionId={section.id} />}
    </div>
  );
}

function PagesList({ sectionId }: { sectionId: string }) {
  const trpc = useTRPC();
  const pagesQuery = useQuery(trpc.pages.listBySection.queryOptions({ sectionId }));
  const invalidate = () =>
    queryClient.invalidateQueries(trpc.pages.listBySection.queryFilter({ sectionId }));

  const create = useMutation(trpc.pages.create.mutationOptions({ onSuccess: invalidate }));
  const rename = useMutation(trpc.pages.rename.mutationOptions({ onSuccess: invalidate }));
  const reorder = useMutation(trpc.pages.reorder.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.pages.delete.mutationOptions({ onSuccess: invalidate }));

  const pages = pagesQuery.data ?? [];

  function move(index: number, delta: -1 | 1) {
    const ids = pages.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    reorder.mutate({ sectionId, orderedIds: ids });
  }

  return (
    <div className="ml-4 grid gap-0.5">
      {pagesQuery.isPending && <span className={cn(rowClass, 'text-muted-foreground')}>Carregando…</span>}
      {pages.map((page, i) => (
        <PageNode
          key={page.id}
          page={page}
          onRename={(titulo) => rename.mutate({ id: page.id, titulo })}
          onDelete={() => {
            if (
              window.confirm(
                `Excluir a página "${page.titulo}"? Todas as tabs dela também serão removidas.`,
              )
            ) {
              remove.mutate({ id: page.id });
            }
          }}
          onMoveUp={i > 0 ? () => move(i, -1) : undefined}
          onMoveDown={i < pages.length - 1 ? () => move(i, 1) : undefined}
        />
      ))}
      <CreatePageForm
        onCreate={(titulo, slug) => create.mutateAsync({ sectionId, titulo, slug })}
      />
    </div>
  );
}

function PageNode({
  page,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  page: NodeShape & { slug: string };
  onRename: (titulo: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <NodeRow
        title={page.titulo}
        label={`página ${page.titulo}`}
        onRename={onRename}
        onDelete={onDelete}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        titleElement={
          <span className="flex min-w-0 flex-1 items-center">
            <button
              className={cn(iconBtnClass, 'shrink-0')}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Recolher' : 'Expandir'} tabs de ${page.titulo}`}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            {/* Clicar na página abre o editor do corpo (TASK-67). */}
            <NavLink to={`/pages/${page.id}`} end className={treeNavLinkClass}>
              {page.titulo}
              <span className="text-muted-foreground ml-1.5">/{page.slug}</span>
            </NavLink>
          </span>
        }
      />
      {expanded && <TabsList pageId={page.id} />}
    </div>
  );
}

function TabsList({ pageId }: { pageId: string }) {
  const trpc = useTRPC();
  const tabsQuery = useQuery(trpc.tabs.listByPage.queryOptions({ pageId }));
  const invalidate = () =>
    queryClient.invalidateQueries(trpc.tabs.listByPage.queryFilter({ pageId }));

  const create = useMutation(trpc.tabs.create.mutationOptions({ onSuccess: invalidate }));
  const rename = useMutation(trpc.tabs.rename.mutationOptions({ onSuccess: invalidate }));
  const reorder = useMutation(trpc.tabs.reorder.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.tabs.delete.mutationOptions({ onSuccess: invalidate }));

  const tabs = tabsQuery.data ?? [];

  function move(index: number, delta: -1 | 1) {
    const ids = tabs.map((t) => t.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    reorder.mutate({ pageId, orderedIds: ids });
  }

  return (
    <div className="ml-4 grid gap-0.5">
      {tabsQuery.isPending && <span className={cn(rowClass, 'text-muted-foreground')}>Carregando…</span>}
      {tabs.map((tab, i) => (
        <NodeRow
          key={tab.id}
          title={tab.titulo}
          label={`tab ${tab.titulo}`}
          onRename={(titulo) => rename.mutate({ id: tab.id, titulo })}
          onDelete={() => {
            if (window.confirm(`Excluir a tab "${tab.titulo}" e seu conteúdo?`)) {
              remove.mutate({ id: tab.id });
            }
          }}
          onMoveUp={i > 0 ? () => move(i, -1) : undefined}
          onMoveDown={i < tabs.length - 1 ? () => move(i, 1) : undefined}
          titleElement={
            <NavLink to={`/pages/${pageId}/tabs/${tab.id}`} className={treeNavLinkClass}>
              {tab.titulo}
            </NavLink>
          }
        />
      ))}
      <InlineCreate label="Nova tab" onCreate={(titulo) => create.mutateAsync({ pageId, titulo })} />
    </div>
  );
}

/** Linha genérica da árvore: título + ações (renomear inline, ↑/↓, excluir). */
function NodeRow({
  title,
  label,
  titleElement,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  title: string;
  label: string;
  titleElement: ReactNode;
  onRename: (titulo: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  if (editing) {
    return (
      <form
        className={rowClass}
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
          aria-label={`Novo título de ${label}`}
          className={treeInputClass}
        />
        <button type="submit" className={iconBtnClass} aria-label={`Salvar título de ${label}`}>
          <Check className="size-4" />
        </button>
        <button type="button" className={iconBtnClass} aria-label="Cancelar" onClick={() => setEditing(false)}>
          <X className="size-4" />
        </button>
      </form>
    );
  }

  return (
    <div className={cn(rowClass, 'group hover:bg-accent')}>
      {titleElement}
      <span className="inline-flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          className={iconBtnClass}
          aria-label={`Renomear ${label}`}
          title="Renomear"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          className={cn(iconBtnClass, !onMoveUp && 'invisible')}
          aria-label={`Mover ${label} para cima`}
          title="Mover para cima"
          onClick={onMoveUp}
        >
          <ArrowUp className="size-3.5" />
        </button>
        <button
          className={cn(iconBtnClass, !onMoveDown && 'invisible')}
          aria-label={`Mover ${label} para baixo`}
          title="Mover para baixo"
          onClick={onMoveDown}
        >
          <ArrowDown className="size-3.5" />
        </button>
        <button
          className={cn(iconBtnClass, 'hover:text-destructive')}
          aria-label={`Excluir ${label}`}
          title="Excluir"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

/** Botão "+" que expande para um input de título. */
function InlineCreate({
  label,
  onCreate,
}: {
  label: string;
  onCreate: (titulo: string) => Promise<unknown>;
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
        className="text-primary flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" /> {label}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={rowClass}>
      <input
        autoFocus
        placeholder={label}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label={label}
        className={treeInputClass}
      />
      <button type="submit" className={iconBtnClass} aria-label={`Criar ${label.toLowerCase()}`}>
        <Check className="size-4" />
      </button>
      <button type="button" className={iconBtnClass} aria-label="Cancelar" onClick={() => setOpen(false)}>
        <X className="size-4" />
      </button>
    </form>
  );
}

/** Criação de página pede título + slug (validado no server). */
function CreatePageForm({
  onCreate,
}: {
  // slug opcional (TASK-70): em branco → o server deriva do título.
  onCreate: (titulo: string, slug: string | undefined) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      // Envia undefined quando em branco, para o server derivar o slug do título.
      await onCreate(titulo.trim(), slug.trim() || undefined);
      setTitulo('');
      setSlug('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof TRPCClientError ? err.message : 'Erro ao criar página');
    }
  }

  if (!open) {
    return (
      <button
        className="text-primary flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" /> Nova página
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn(rowClass, 'flex-wrap')}>
      <input
        autoFocus
        placeholder="Título da página"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label="Título da nova página"
        className={treeInputClass}
      />
      <input
        placeholder="slug (opcional)"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        aria-label="Slug da nova página (opcional)"
        className={treeInputClass}
      />
      <button type="submit" className={iconBtnClass} aria-label="Criar página">
        <Check className="size-4" />
      </button>
      <button type="button" className={iconBtnClass} aria-label="Cancelar" onClick={() => setOpen(false)}>
        <X className="size-4" />
      </button>
      <span className="text-muted-foreground w-full text-xs">
        Deixe o slug em branco para gerá-lo a partir do título.
      </span>
      {error && (
        <span role="alert" className="text-destructive w-full text-xs">
          {error}
        </span>
      )}
    </form>
  );
}
