import { createContext, useContext, useState, type FormEvent } from 'react';
import { TRPCClientError } from '@trpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { DragHandle, useDragReorder, type DragHandleProps, type DragRowProps } from './dragReorder.js';
import { CopyLinkItem, MoveToMenuSub, invalidateNavAfterMove } from './RowActionItems.js';
import { createLinkClass } from '@/lib/styles';
import { cn } from '@/lib/utils';

/**
 * Navegação da documentação (TASK-86): dois níveis — Seção → Página — escopados
 * ao **menu ativo** (`sections.listByMenu`, do header/TASK-85). As Tabs saíram
 * da árvore (decisão do usuário no `plano-de-interface.md`): agora só existem
 * dentro do editor da página (`PageContentPage`). A sidebar deve parecer uma
 * navegação, não um explorer de arquivos — grupos com rótulo em maiúsculas,
 * página selecionada com fundo sutil (sem bordas pesadas).
 *
 * Criar/renomear/reordenar/excluir seções e páginas continua inline. As ações
 * por linha (renomear/mover/excluir) usam o `RowActionsMenu` compartilhado
 * (TASK-89): um único gatilho de overflow "⋯" no hover, no lugar da antiga
 * fileira de 4 ícones sempre visíveis.
 */

const iconBtnClass =
  'inline-flex items-center justify-center rounded-editorial-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors';
const treeInputClass =
  'min-w-0 flex-1 rounded-editorial-sm border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';

// Fecha o drawer mobile ao navegar (TASK-92) sem prop-drilling pela árvore:
// só o `PageRow` (o link que de fato navega) consome isto.
const OnNavigateContext = createContext<(() => void) | undefined>(undefined);

// Slug do menu ativo, só para o "Copiar link" do `PageRow` montar a URL
// pública canônica (SYS-37). Mesmo motivo do contexto acima: evita arrastar a
// prop por Section → PagesList → PageRow.
const MenuSlugContext = createContext<string | null>(null);

export function SidebarTree({
  activeMenuId,
  onNavigate,
}: {
  activeMenuId: string | null;
  /** Chamado ao clicar numa página — o layout fecha o drawer no mobile (TASK-92). */
  onNavigate?: () => void;
}) {
  const trpc = useTRPC();
  const sectionsQuery = useQuery({
    ...trpc.sections.listByMenu.queryOptions({ menuId: activeMenuId ?? '' }),
    enabled: activeMenuId != null,
  });
  const invalidate = () =>
    activeMenuId &&
    queryClient.invalidateQueries(trpc.sections.listByMenu.queryFilter({ menuId: activeMenuId }));

  const create = useMutation(trpc.sections.create.mutationOptions({ onSuccess: invalidate }));
  const rename = useMutation(trpc.sections.rename.mutationOptions({ onSuccess: invalidate }));
  const reorder = useMutation(trpc.sections.reorder.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.sections.delete.mutationOptions({ onSuccess: invalidate }));

  const sections = sectionsQuery.data ?? [];
  // `menus.list` já está no cache (o header o consome); daqui sai só o slug do
  // menu ativo, usado pelo "Copiar link" das páginas.
  const menusQuery = useQuery(trpc.menus.list.queryOptions());
  const activeMenuSlug =
    menusQuery.data?.find((menu) => menu.id === activeMenuId)?.slug ?? null;

  const dnd = useDragReorder({
    items: sections,
    onReorder: (orderedIds) => activeMenuId && reorder.mutate({ menuId: activeMenuId, orderedIds }),
  });

  if (!activeMenuId) {
    // O header ainda está resolvendo qual menu está ativo (menus.list).
    return <p className="text-muted-foreground px-2 py-1 text-sm">Loading menu…</p>;
  }

  return (
    <OnNavigateContext.Provider value={onNavigate}>
    <MenuSlugContext.Provider value={activeMenuSlug}>
    <nav aria-label="Documentation structure" className="grid content-start gap-6 text-sm">
      {sectionsQuery.isPending && <span className="text-muted-foreground px-2 text-sm">Loading…</span>}
      {!sectionsQuery.isPending && sections.length === 0 && (
        <p className="text-muted-foreground px-2 text-sm">No sections in this menu yet.</p>
      )}
      {sections.map((section, i) => (
        <SectionGroup
          key={section.id}
          section={section}
          dragRow={dnd.getRowProps(section.id)}
          dragHandle={dnd.getHandleProps(section.id, i)}
          onRename={(titulo) => rename.mutate({ id: section.id, titulo })}
          onDelete={() => {
            if (
              window.confirm(
                `Delete the section "${section.titulo}"? All pages inside it will also be removed.`,
              )
            ) {
              remove.mutate({ id: section.id });
            }
          }}
        />
      ))}
      <InlineCreate
        label="New section"
        onCreate={(titulo) => create.mutateAsync({ menuId: activeMenuId, titulo })}
      />
    </nav>
    </MenuSlugContext.Provider>
    </OnNavigateContext.Provider>
  );
}

interface NodeShape {
  id: string;
  titulo: string;
  // slug: sections é nullable no DB; pages é notNull. Usado no "Copiar link".
  slug?: string | null;
}

/**
 * Grupo de seção: rótulo-categoria em maiúsculas (colapsável) + suas páginas.
 * Aberto por padrão para ler como navegação (não como árvore recolhida).
 */
function SectionGroup({
  section,
  onRename,
  onDelete,
  dragRow,
  dragHandle,
}: {
  section: NodeShape;
  onRename: (titulo: string) => void;
  onDelete: () => void;
  dragRow: DragRowProps;
  dragHandle: DragHandleProps;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.titulo);

  return (
    <div className="grid gap-0.5">
      {editing ? (
        <RenameForm
          label={`section ${section.titulo}`}
          initial={section.titulo}
          draft={draft}
          setDraft={setDraft}
          onSubmit={() => {
            if (draft.trim()) onRename(draft.trim());
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div {...dragRow} className="group/section flex items-center gap-1 pr-1">
          <DragHandle
            {...dragHandle}
            label={`Reorder section ${section.titulo}`}
            className="-ml-1 opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100"
          />
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-editorial-sm px-1 py-0.5 text-left text-xs font-semibold uppercase tracking-[0.1em] transition-colors md:min-h-0"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} section ${section.titulo}`}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              className={cn('size-3.5 shrink-0 transition-transform', !expanded && '-rotate-90')}
            />
            <span className="truncate">{section.titulo}</span>
          </button>
          <RowActionsMenu
            triggerLabel={`More actions for section ${section.titulo}`}
            onRename={() => {
              setDraft(section.titulo);
              setEditing(true);
            }}
            onDelete={onDelete}
            triggerClassName="opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100"
          />
        </div>
      )}
      {expanded && <PagesList sectionId={section.id} sectionSlug={section.slug} />}
    </div>
  );
}

function PagesList({ sectionId, sectionSlug }: { sectionId: string; sectionSlug?: string | null }) {
  const trpc = useTRPC();
  const pagesQuery = useQuery(trpc.pages.listBySection.queryOptions({ sectionId }));
  const invalidate = () =>
    queryClient.invalidateQueries(trpc.pages.listBySection.queryFilter({ sectionId }));

  const create = useMutation(trpc.pages.create.mutationOptions({ onSuccess: invalidate }));
  const rename = useMutation(trpc.pages.rename.mutationOptions({ onSuccess: invalidate }));
  const reorder = useMutation(trpc.pages.reorder.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.pages.delete.mutationOptions({ onSuccess: invalidate }));

  const pages = pagesQuery.data ?? [];

  const dnd = useDragReorder({
    items: pages,
    onReorder: (orderedIds) => reorder.mutate({ sectionId, orderedIds }),
  });

  return (
    <div className="grid gap-0.5 pl-2">
      {pagesQuery.isPending && <span className="text-muted-foreground px-2 text-sm">Loading…</span>}
      {pages.map((page, i) => (
        <PageRow
          key={page.id}
          page={page}
          sectionId={sectionId}
          sectionSlug={sectionSlug}
          dragRow={dnd.getRowProps(page.id)}
          dragHandle={dnd.getHandleProps(page.id, i)}
          onRename={(titulo) => rename.mutate({ id: page.id, titulo })}
          onDelete={() => {
            if (window.confirm(`Delete the page "${page.titulo}" and all of its content?`)) {
              remove.mutate({ id: page.id });
            }
          }}
        />
      ))}
      <CreatePageForm onCreate={(titulo, slug) => create.mutateAsync({ sectionId, titulo, slug })} />
    </div>
  );
}

/** Página: link de navegação (sem chevron de tabs — TASK-86). Selecionada = fundo sutil. */
function PageRow({
  page,
  sectionId,
  sectionSlug,
  onRename,
  onDelete,
  dragRow,
  dragHandle,
}: {
  page: NodeShape;
  sectionId: string;
  sectionSlug?: string | null;
  onRename: (titulo: string) => void;
  onDelete: () => void;
  dragRow: DragRowProps;
  dragHandle: DragHandleProps;
}) {
  const trpc = useTRPC();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page.titulo);
  const onNavigate = useContext(OnNavigateContext);
  const menuSlug = useContext(MenuSlugContext);

  if (editing) {
    return (
      <RenameForm
        label={`page ${page.titulo}`}
        initial={page.titulo}
        draft={draft}
        setDraft={setDraft}
        onSubmit={() => {
          if (draft.trim()) onRename(draft.trim());
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div {...dragRow} className="group/page flex items-center gap-1">
      <DragHandle
        {...dragHandle}
        label={`Reorder page ${page.titulo}`}
        className="opacity-0 group-hover/page:opacity-100 group-focus-within/page:opacity-100"
      />
      <NavLink
        to={`/pages/${page.id}`}
        end
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            // ≥44px de alvo de toque no mobile (TASK-92); compacto no desktop.
            'flex min-h-11 min-w-0 flex-1 items-center truncate rounded-editorial-sm px-2 py-1 no-underline transition-colors md:min-h-0',
            isActive
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          )
        }
      >
        {page.titulo}
      </NavLink>
      <RowActionsMenu
        triggerLabel={`More actions for page ${page.titulo}`}
        onRename={() => {
          setDraft(page.titulo);
          setEditing(true);
        }}
        onDelete={onDelete}
        extraItems={
          <>
            <CopyLinkItem
              menuSlug={menuSlug}
              sectionSlug={sectionSlug}
              pageSlug={page.slug}
              disabledReason="This page has no slug yet"
            />
            <MoveToMenuSub
              pageId={page.id}
              currentSectionId={sectionId}
              onMoved={() => invalidateNavAfterMove(trpc)}
            />
          </>
        }
        triggerClassName="opacity-0 group-hover/page:opacity-100 group-focus-within/page:opacity-100"
      />
    </div>
  );
}

/** Edição inline de título (compartilhada por seção e página). */
function RenameForm({
  label,
  draft,
  setDraft,
  onSubmit,
  onCancel,
}: {
  label: string;
  initial: string;
  draft: string;
  setDraft: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={`New title for ${label}`}
        className={treeInputClass}
      />
      <button type="submit" className={iconBtnClass} aria-label={`Save title for ${label}`}>
        <Check className="size-4" />
      </button>
      <button type="button" className={iconBtnClass} aria-label="Cancel" onClick={onCancel}>
        <X className="size-4" />
      </button>
    </form>
  );
}

/** Botão "+" que expande para um input de título (Nova seção). */
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
      <button className={cn(createLinkClass, 'px-1 py-1')} onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> {label}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1">
      <input
        autoFocus
        placeholder={label}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label={label}
        className={treeInputClass}
      />
      <button type="submit" className={iconBtnClass} aria-label={`Create ${label.toLowerCase()}`}>
        <Check className="size-4" />
      </button>
      <button type="button" className={iconBtnClass} aria-label="Cancel" onClick={() => setOpen(false)}>
        <X className="size-4" />
      </button>
    </form>
  );
}

/** Adicionar página (embaixo do grupo): pede título + slug opcional. */
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
      await onCreate(titulo.trim(), slug.trim() || undefined);
      setTitulo('');
      setSlug('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof TRPCClientError ? err.message : 'Error creating page');
    }
  }

  if (!open) {
    return (
      <button className={cn(createLinkClass, 'px-2 py-1')} onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add page
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-1 py-0.5">
      <input
        autoFocus
        placeholder="Page title"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label="New page title"
        className={treeInputClass}
      />
      <input
        placeholder="slug (optional)"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        aria-label="New page slug (optional)"
        className={treeInputClass}
      />
      <button type="submit" className={iconBtnClass} aria-label="Create page">
        <Check className="size-4" />
      </button>
      <button type="button" className={iconBtnClass} aria-label="Cancel" onClick={() => setOpen(false)}>
        <X className="size-4" />
      </button>
      <span className="text-muted-foreground w-full text-xs">
        Leave the slug blank to generate it from the title.
      </span>
      {error && (
        <span role="alert" className="text-destructive w-full text-xs">
          {error}
        </span>
      )}
    </form>
  );
}
