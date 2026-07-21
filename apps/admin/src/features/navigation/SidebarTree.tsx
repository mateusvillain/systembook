import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { TRPCClientError } from '@trpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { queryClient, useTRPC } from '../../lib/trpc.js';

/**
 * Árvore de navegação (TASK-23): sections → pages → tabs, com criar/renomear/
 * reordenar/excluir inline em cada nível. Reordenação usa botões ↑/↓ enviando
 * a lista completa de ids ao `reorder` (drag-and-drop fica para depois).
 * Exclusão confirma via window.confirm — o delete cascateia toda a subárvore.
 */

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.15rem 0.25rem',
  borderRadius: 4,
};

const iconButton: CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  padding: '0 0.15rem',
  fontSize: '0.85rem',
  lineHeight: 1.4,
};

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
      style={{ fontSize: '0.9rem', display: 'grid', gap: '0.25rem', alignContent: 'start' }}
    >
      <strong style={{ padding: '0.15rem 0.25rem', color: '#666', fontSize: '0.8rem' }}>
        ESTRUTURA
      </strong>
      {sectionsQuery.isPending && <span style={rowStyle}>Carregando…</span>}
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
            style={{ ...iconButton, fontWeight: 600, flex: 1, textAlign: 'left' }}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '▾' : '▸'} {section.titulo}
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
    <div style={{ marginLeft: '1rem', display: 'grid', gap: '0.1rem' }}>
      {pagesQuery.isPending && <span style={rowStyle}>Carregando…</span>}
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
          <span style={{ display: 'flex', flex: 1, alignItems: 'center', minWidth: 0 }}>
            <button
              style={{ ...iconButton, flexShrink: 0 }}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Recolher' : 'Expandir'} tabs de ${page.titulo}`}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '▾' : '▸'}
            </button>
            {/* Clicar na página abre o editor do corpo (TASK-67). */}
            <NavLink
              to={`/pages/${page.id}`}
              end
              style={({ isActive }) => ({
                flex: 1,
                minWidth: 0,
                textDecoration: 'none',
                color: isActive ? '#0b57d0' : 'inherit',
                fontWeight: isActive ? 600 : 400,
              })}
            >
              {page.titulo}
              <span style={{ color: '#999', marginLeft: '0.35rem' }}>/{page.slug}</span>
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
    <div style={{ marginLeft: '1rem', display: 'grid', gap: '0.1rem' }}>
      {tabsQuery.isPending && <span style={rowStyle}>Carregando…</span>}
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
            <NavLink
              to={`/pages/${pageId}/tabs/${tab.id}`}
              style={({ isActive }) => ({
                flex: 1,
                textDecoration: 'none',
                color: isActive ? '#0b57d0' : 'inherit',
                fontWeight: isActive ? 600 : 400,
              })}
            >
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
        style={rowStyle}
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
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" style={iconButton} aria-label={`Salvar título de ${label}`}>
          ✓
        </button>
        <button type="button" style={iconButton} onClick={() => setEditing(false)}>
          ✕
        </button>
      </form>
    );
  }

  return (
    <div style={rowStyle}>
      {titleElement}
      <span style={{ display: 'inline-flex', gap: '0.1rem' }}>
        <button
          style={iconButton}
          aria-label={`Renomear ${label}`}
          title="Renomear"
          onClick={() => {
            setDraft(title);
            setEditing(true);
          }}
        >
          ✎
        </button>
        <button
          style={{ ...iconButton, visibility: onMoveUp ? 'visible' : 'hidden' }}
          aria-label={`Mover ${label} para cima`}
          title="Mover para cima"
          onClick={onMoveUp}
        >
          ↑
        </button>
        <button
          style={{ ...iconButton, visibility: onMoveDown ? 'visible' : 'hidden' }}
          aria-label={`Mover ${label} para baixo`}
          title="Mover para baixo"
          onClick={onMoveDown}
        >
          ↓
        </button>
        <button
          style={iconButton}
          aria-label={`Excluir ${label}`}
          title="Excluir"
          onClick={onDelete}
        >
          🗑
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
        style={{ ...iconButton, textAlign: 'left', color: '#0b57d0', padding: '0.15rem 0.25rem' }}
        onClick={() => setOpen(true)}
      >
        + {label}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={rowStyle}>
      <input
        autoFocus
        placeholder={label}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label={label}
        style={{ flex: 1, minWidth: 0 }}
      />
      <button type="submit" style={iconButton} aria-label={`Criar ${label.toLowerCase()}`}>
        ✓
      </button>
      <button type="button" style={iconButton} onClick={() => setOpen(false)}>
        ✕
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
        style={{ ...iconButton, textAlign: 'left', color: '#0b57d0', padding: '0.15rem 0.25rem' }}
        onClick={() => setOpen(true)}
      >
        + Nova página
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...rowStyle, flexWrap: 'wrap' }}>
      <input
        autoFocus
        placeholder="Título da página"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label="Título da nova página"
        style={{ flex: 1, minWidth: 0 }}
      />
      <input
        placeholder="slug (opcional)"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        aria-label="Slug da nova página (opcional)"
        style={{ flex: 1, minWidth: 0 }}
      />
      <button type="submit" style={iconButton} aria-label="Criar página">
        ✓
      </button>
      <button type="button" style={iconButton} onClick={() => setOpen(false)}>
        ✕
      </button>
      <span style={{ fontSize: '0.75rem', color: '#777', width: '100%' }}>
        Deixe o slug em branco para gerá-lo a partir do título.
      </span>
      {error && (
        <span role="alert" style={{ color: '#b00020', fontSize: '0.8rem', width: '100%' }}>
          {error}
        </span>
      )}
    </form>
  );
}
