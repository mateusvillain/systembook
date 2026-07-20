import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';

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
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Selecionar componente para embed"
        data-testid="component-embed-picker"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 8,
          width: 'min(440px, 92vw)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid #eee',
          }}
        >
          <strong>
            {component === null ? 'Escolha um componente' : `Variante de ${component}`}
          </strong>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onCancel}
            style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ×
          </button>
        </header>

        <div style={{ padding: '0.75rem 1rem', overflow: 'auto' }}>
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
      <input
        type="search"
        autoFocus
        placeholder="Filtrar componentes…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filtrar componentes"
        style={{
          width: '100%',
          padding: '0.4rem 0.6rem',
          border: '1px solid #ccc',
          borderRadius: 4,
          marginBottom: '0.5rem',
          boxSizing: 'border-box',
        }}
      />
      {query.isLoading && <p style={{ color: '#666' }}>Carregando…</p>}
      {query.isError && <p style={{ color: '#c00' }}>Erro ao carregar componentes.</p>}
      {!query.isLoading && !query.isError && (query.data?.length ?? 0) === 0 && (
        <p style={{ color: '#666' }}>
          Nenhum componente publicado ainda — rode o conector no repositório do design system.
        </p>
      )}
      {components.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {components.map((name) => (
            <li key={name}>
              <button
                type="button"
                data-component-option={name}
                onClick={() => onPick(name)}
                style={optionButtonStyle}
              >
                🧩 {name}
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
      <button
        type="button"
        onClick={onBack}
        style={{
          border: 'none',
          background: 'none',
          color: '#3366cc',
          cursor: 'pointer',
          padding: 0,
          marginBottom: '0.5rem',
        }}
      >
        ← Trocar componente
      </button>
      {query.isLoading && <p style={{ color: '#666' }}>Carregando variantes…</p>}
      {query.isError && <p style={{ color: '#c00' }}>Erro ao carregar variantes.</p>}
      {!query.isLoading && (query.data?.length ?? 0) === 0 && (
        <p style={{ color: '#666' }}>Nenhuma variante publicada para {component}.</p>
      )}
      {(query.data?.length ?? 0) > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {query.data!.map((variantId) => (
            <li key={variantId}>
              <button
                type="button"
                data-variant-option={variantId}
                onClick={() => onPick(variantId)}
                style={{
                  ...optionButtonStyle,
                  fontWeight: variantId === currentVariant ? 700 : 400,
                }}
              >
                {variantId}
                {variantId === currentVariant && (
                  <span style={{ color: '#666', fontWeight: 400 }}> (atual)</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const optionButtonStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '0.5rem 0.6rem',
  border: '1px solid #e2e2e2',
  borderRadius: 4,
  background: '#fafafa',
  cursor: 'pointer',
  fontSize: '0.9rem',
};
