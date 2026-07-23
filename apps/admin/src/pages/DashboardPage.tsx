import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useOutletContext } from 'react-router-dom';
import { Check, FilePlus2, FolderPlus, Plus, X } from 'lucide-react';
import { queryClient, useTRPC } from '../lib/trpc.js';
import type { AdminOutletContext } from '../components/AdminLayout.js';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { adminTypography } from '@/lib/typography';

/**
 * Home do menu ativo (TASK-90). Antes era um "bem-vindo" estático que ignorava
 * o menu selecionado; agora é a superfície onde os empty states de estrutura
 * aparecem (plano `# Componentes > Empty State`):
 *
 * - **Menu sem seções** → Empty State grande "Criar primeira seção" (estado
 *   alcançável no dia 1: uma instância nova tem o menu padrão da TASK-83, mas
 *   zero seções até o operador criar uma).
 * - **Seção sem páginas** → como seções não são navegáveis (decisão da TASK-86,
 *   são apenas agrupadores na sidebar), o zero-state da seção aparece aqui, na
 *   área principal, num Empty State compacto "Criar primeira página".
 *
 * Quando há conteúdo, nada muda de comportamento — só as ramificações de
 * zero-state foram adicionadas.
 */
export function DashboardPage() {
  const { activeMenuId } = useOutletContext<AdminOutletContext>();
  const trpc = useTRPC();
  const sectionsQuery = useQuery({
    ...trpc.sections.listByMenu.queryOptions({ menuId: activeMenuId ?? '' }),
    enabled: activeMenuId != null,
  });
  const invalidate = () =>
    activeMenuId &&
    queryClient.invalidateQueries(trpc.sections.listByMenu.queryFilter({ menuId: activeMenuId }));
  const createSection = useMutation(trpc.sections.create.mutationOptions({ onSuccess: invalidate }));

  if (!activeMenuId || sectionsQuery.isPending) {
    return <p className="text-muted-foreground">Carregando…</p>;
  }

  const sections = sectionsQuery.data ?? [];

  if (sections.length === 0) {
    return (
      <EmptyState
        icon={FolderPlus}
        title="Nenhuma seção ainda"
        description="Seções agrupam as páginas deste menu. Crie a primeira para começar a montar a documentação."
        action={
          <CreateFirstButton
            label="Criar primeira seção"
            placeholder="Nome da seção"
            onCreate={(titulo) => createSection.mutateAsync({ menuId: activeMenuId, titulo })}
          />
        }
      />
    );
  }

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className={adminTypography.title}>Início</h1>
        <p className={adminTypography.metadata}>
          Escolha uma página na lateral para editar, ou continue montando a estrutura abaixo.
        </p>
      </header>
      <div className="grid gap-6">
        {sections.map((section) => (
          <SectionOverview key={section.id} sectionId={section.id} titulo={section.titulo} />
        ))}
      </div>
    </div>
  );
}

/** Uma seção no home: rótulo + suas páginas como links, ou o zero-state de página. */
function SectionOverview({ sectionId, titulo }: { sectionId: string; titulo: string }) {
  const trpc = useTRPC();
  const pagesQuery = useQuery(trpc.pages.listBySection.queryOptions({ sectionId }));
  const invalidate = () =>
    queryClient.invalidateQueries(trpc.pages.listBySection.queryFilter({ sectionId }));
  // slug opcional (TASK-70): sem slug, o server deriva do título.
  const createPage = useMutation(trpc.pages.create.mutationOptions({ onSuccess: invalidate }));

  const pages = pagesQuery.data ?? [];

  return (
    <section className="grid gap-2">
      <h2 className={adminTypography.category}>{titulo}</h2>
      {pagesQuery.isPending ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : pages.length === 0 ? (
        <EmptyState
          size="sm"
          icon={FilePlus2}
          title="Nenhuma página nesta seção"
          description="Crie a primeira página para começar a escrever."
          action={
            <CreateFirstButton
              label="Criar primeira página"
              placeholder="Título da página"
              onCreate={(titulo) => createPage.mutateAsync({ sectionId, titulo })}
            />
          }
          className="border-border rounded-editorial-md border border-dashed"
        />
      ) : (
        <ul className="grid gap-0.5">
          {pages.map((page) => (
            <li key={page.id}>
              <Link
                to={`/pages/${page.id}`}
                className="text-muted-foreground hover:text-foreground hover:bg-accent block rounded-editorial-sm px-2 py-1 no-underline transition-colors"
              >
                {page.titulo}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Ação primária dos empty states: um botão que expande num input de título
 * inline (mesmo idioma da sidebar), reusando a mutation passada pelo chamador.
 * Só título — o slug de página é derivado pelo server (TASK-70) e seções não
 * têm slug.
 */
function CreateFirstButton({
  label,
  placeholder,
  onCreate,
}: {
  label: string;
  placeholder: string;
  onCreate: (titulo: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!titulo.trim()) return;
    setPending(true);
    try {
      await onCreate(titulo.trim());
      setTitulo('');
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {label}
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        autoFocus
        placeholder={placeholder}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label={label}
        className="border-input min-w-0 rounded-editorial-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      />
      <Button type="submit" size="icon" disabled={pending} aria-label="Confirmar">
        <Check className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Cancelar"
        onClick={() => setOpen(false)}
      >
        <X className="size-4" />
      </Button>
    </form>
  );
}
