import { createContext, useContext, useState, type FormEvent } from 'react';
import { TRPCClientError } from '@trpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import { RowActionsMenu } from '@/components/RowActionsMenu';
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

  function move(index: number, delta: -1 | 1) {
    if (!activeMenuId) return;
    const ids = sections.map((s) => s.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    reorder.mutate({ menuId: activeMenuId, orderedIds: ids });
  }

  if (!activeMenuId) {
    // O header ainda está resolvendo qual menu está ativo (menus.list).
    return <p className="text-muted-foreground px-2 py-1 text-sm">Carregando menu…</p>;
  }

  return (
    <OnNavigateContext.Provider value={onNavigate}>
    <nav aria-label="Estrutura da documentação" className="grid content-start gap-6 text-sm">
      {sectionsQuery.isPending && <span className="text-muted-foreground px-2 text-sm">Carregando…</span>}
      {!sectionsQuery.isPending && sections.length === 0 && (
        <p className="text-muted-foreground px-2 text-sm">Nenhuma seção neste menu ainda.</p>
      )}
      {sections.map((section, i) => (
        <SectionGroup
          key={section.id}
          section={section}
          onRename={(titulo) => rename.mutate({ id: section.id, titulo })}
          onDelete={() => {
            if (
              window.confirm(
                `Excluir a seção "${section.titulo}"? Todas as páginas dentro dela também serão removidas.`,
              )
            ) {
              remove.mutate({ id: section.id });
            }
          }}
          onMoveUp={i > 0 ? () => move(i, -1) : undefined}
          onMoveDown={i < sections.length - 1 ? () => move(i, 1) : undefined}
        />
      ))}
      <InlineCreate
        label="Nova seção"
        onCreate={(titulo) => create.mutateAsync({ menuId: activeMenuId, titulo })}
      />
    </nav>
    </OnNavigateContext.Provider>
  );
}

interface NodeShape {
  id: string;
  titulo: string;
}

/**
 * Grupo de seção: rótulo-categoria em maiúsculas (colapsável) + suas páginas.
 * Aberto por padrão para ler como navegação (não como árvore recolhida).
 */
function SectionGroup({
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
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.titulo);

  return (
    <div className="grid gap-0.5">
      {editing ? (
        <RenameForm
          label={`seção ${section.titulo}`}
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
        <div className="group/section flex items-center gap-1 pr-1">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground -ml-1 flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-editorial-sm px-1 py-0.5 text-left text-xs font-semibold uppercase tracking-[0.1em] transition-colors md:min-h-0"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Recolher' : 'Expandir'} seção ${section.titulo}`}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              className={cn('size-3.5 shrink-0 transition-transform', !expanded && '-rotate-90')}
            />
            <span className="truncate">{section.titulo}</span>
          </button>
          <RowActionsMenu
            triggerLabel={`Mais ações da seção ${section.titulo}`}
            onRename={() => {
              setDraft(section.titulo);
              setEditing(true);
            }}
            onDelete={onDelete}
            onMovePrev={onMoveUp}
            onMoveNext={onMoveDown}
            triggerClassName="opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100"
          />
        </div>
      )}
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
    <div className="grid gap-0.5 pl-2">
      {pagesQuery.isPending && <span className="text-muted-foreground px-2 text-sm">Carregando…</span>}
      {pages.map((page, i) => (
        <PageRow
          key={page.id}
          page={page}
          onRename={(titulo) => rename.mutate({ id: page.id, titulo })}
          onDelete={() => {
            if (window.confirm(`Excluir a página "${page.titulo}" e todo o seu conteúdo?`)) {
              remove.mutate({ id: page.id });
            }
          }}
          onMoveUp={i > 0 ? () => move(i, -1) : undefined}
          onMoveDown={i < pages.length - 1 ? () => move(i, 1) : undefined}
        />
      ))}
      <CreatePageForm onCreate={(titulo, slug) => create.mutateAsync({ sectionId, titulo, slug })} />
    </div>
  );
}

/** Página: link de navegação (sem chevron de tabs — TASK-86). Selecionada = fundo sutil. */
function PageRow({
  page,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  page: NodeShape;
  onRename: (titulo: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page.titulo);
  const onNavigate = useContext(OnNavigateContext);

  if (editing) {
    return (
      <RenameForm
        label={`página ${page.titulo}`}
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
    <div className="group/page flex items-center gap-1">
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
        triggerLabel={`Mais ações da página ${page.titulo}`}
        onRename={() => {
          setDraft(page.titulo);
          setEditing(true);
        }}
        onDelete={onDelete}
        onMovePrev={onMoveUp}
        onMoveNext={onMoveDown}
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
        aria-label={`Novo título de ${label}`}
        className={treeInputClass}
      />
      <button type="submit" className={iconBtnClass} aria-label={`Salvar título de ${label}`}>
        <Check className="size-4" />
      </button>
      <button type="button" className={iconBtnClass} aria-label="Cancelar" onClick={onCancel}>
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
      <button type="submit" className={iconBtnClass} aria-label={`Criar ${label.toLowerCase()}`}>
        <Check className="size-4" />
      </button>
      <button type="button" className={iconBtnClass} aria-label="Cancelar" onClick={() => setOpen(false)}>
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
      setError(err instanceof TRPCClientError ? err.message : 'Erro ao criar página');
    }
  }

  if (!open) {
    return (
      <button className={cn(createLinkClass, 'px-2 py-1')} onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Adicionar página
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-1 py-0.5">
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
