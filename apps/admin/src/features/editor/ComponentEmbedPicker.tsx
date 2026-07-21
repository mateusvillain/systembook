import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Puzzle, X } from 'lucide-react';
import { useTRPC } from '../../lib/trpc.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const optionButtonClass =
  'w-full rounded-md border bg-muted/40 px-2.5 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors';

/**
 * Picker de componente/variante para o component-embed (TASK-48). Fonte de
 * dados é `component_previews` (via `componentPreviews.listComponents` /
 * `listVariants`) — só aparecem componentes que um time já publicou por CI
 * (TASK-43); não há registro separado de componentes.
 *
 * Fluxo em dois passos: (1) lista filtrável de nomes de componente; (2) as
 * variantes publicadas do componente escolhido. Confirmar dispara `onConfirm`
 * com o par selecionado — o chamador insere/atualiza o nó.
 */

export interface ComponentEmbedSelection {
  componentName: string;
  variantId: string;
}

export function ComponentEmbedPicker({
  initial,
  onConfirm,
  onCancel,
}: {
  /** Pré-seleção ao reabrir sobre um embed existente (step 4). */
  initial?: ComponentEmbedSelection | null;
  onConfirm: (selection: ComponentEmbedSelection) => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const [component, setComponent] = useState<string | null>(initial?.componentName ?? null);
  const [filter, setFilter] = useState('');

  const componentsQuery = useQuery(trpc.componentPreviews.listComponents.queryOptions());
  const variantsQuery = useQuery({
    ...trpc.componentPreviews.listVariants.queryOptions({ componentName: component ?? '' }),
    enabled: component !== null,
  });

  // Fecha no Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const filteredComponents = useMemo(() => {
    const all = componentsQuery.data ?? [];
    const q = filter.trim().toLowerCase();
    return q ? all.filter((name) => name.toLowerCase().includes(q)) : all;
  }, [componentsQuery.data, filter]);

  return (
    <div
      role="presentation"
      onMouseDown={onCancel}
      className="sb-admin fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Selecionar componente para embed"
        data-testid="component-embed-picker"
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-background flex max-h-[80vh] w-[min(440px,92vw)] flex-col overflow-hidden rounded-lg border shadow-lg"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <strong>{component === null ? 'Escolha um componente' : `Variante de ${component}`}</strong>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={onCancel}>
            <X />
          </Button>
        </header>

        <div className="overflow-auto px-4 py-3">
          {component === null ? (
            <ComponentStep
              query={componentsQuery}
              filter={filter}
              setFilter={setFilter}
              components={filteredComponents}
              onPick={setComponent}
            />
          ) : (
            <VariantStep
              component={component}
              query={variantsQuery}
              currentVariant={initial?.componentName === component ? initial.variantId : null}
              onBack={() => setComponent(null)}
              onPick={(variantId) => onConfirm({ componentName: component, variantId })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ComponentStep({
  query,
  filter,
  setFilter,
  components,
  onPick,
}: {
  query: { isLoading: boolean; isError: boolean; data: string[] | undefined };
  filter: string;
  setFilter: (v: string) => void;
  components: string[];
  onPick: (name: string) => void;
}) {
  return (
    <>
      <Input
        type="search"
        autoFocus
        placeholder="Filtrar componentes…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filtrar componentes"
        className="mb-2"
      />
      {query.isLoading && <p className="text-muted-foreground text-sm">Carregando…</p>}
      {query.isError && <p className="text-destructive text-sm">Erro ao carregar componentes.</p>}
      {!query.isLoading && !query.isError && (query.data?.length ?? 0) === 0 && (
        <p className="text-muted-foreground text-sm">
          Nenhum componente publicado ainda — rode o conector no repositório do design system.
        </p>
      )}
      {components.length > 0 && (
        <ul className="grid list-none gap-1 p-0">
          {components.map((name) => (
            <li key={name}>
              <button
                type="button"
                data-component-option={name}
                onClick={() => onPick(name)}
                className={cn(optionButtonClass, 'flex items-center gap-2')}
              >
                <Puzzle className="size-4" /> {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function VariantStep({
  component,
  query,
  currentVariant,
  onBack,
  onPick,
}: {
  component: string;
  query: { isLoading: boolean; isError: boolean; data: string[] | undefined };
  currentVariant: string | null;
  onBack: () => void;
  onPick: (variantId: string) => void;
}) {
  return (
    <>
      <Button type="button" variant="link" className="mb-2 h-auto gap-1 px-0" onClick={onBack}>
        <ChevronLeft className="size-4" /> Trocar componente
      </Button>
      {query.isLoading && <p className="text-muted-foreground text-sm">Carregando variantes…</p>}
      {query.isError && <p className="text-destructive text-sm">Erro ao carregar variantes.</p>}
      {!query.isLoading && (query.data?.length ?? 0) === 0 && (
        <p className="text-muted-foreground text-sm">Nenhuma variante publicada para {component}.</p>
      )}
      {(query.data?.length ?? 0) > 0 && (
        <ul className="grid list-none gap-1 p-0">
          {query.data!.map((variantId) => (
            <li key={variantId}>
              <button
                type="button"
                data-variant-option={variantId}
                onClick={() => onPick(variantId)}
                className={cn(optionButtonClass, variantId === currentVariant && 'font-bold')}
              >
                {variantId}
                {variantId === currentVariant && (
                  <span className="text-muted-foreground font-normal"> (atual)</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
