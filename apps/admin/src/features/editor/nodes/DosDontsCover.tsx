import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DosDontsCover } from '@systembook/schema';
import { useTRPC } from '../../../lib/trpc.js';
import { ComponentEmbedPicker } from '../ComponentEmbedPicker.js';

/**
 * UI de cover do bloco dos-donts (TASK-73): opcional, imagem OU
 * component-embed. A resolução do embed (loading/empty/live via
 * `componentPreviews.getLatest`) **duplica deliberadamente** a lógica de
 * `nodes/ComponentEmbed.tsx` (TASK-47/51) em vez de extrair um helper
 * compartilhado — a superfície do component-embed top-level já é validada
 * por E2E das TASK-47/48/51 e extrair alteraria seu DOM; mantenha os dois
 * em sincronia se a máquina de estados mudar. Diferente do embed top-level,
 * o cover não expõe o painel de controles interativos (`ControlsPanel`) —
 * é um slot de apoio visual, não o embed principal da página.
 */

const actionButtonStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  borderRadius: 4,
  background: '#fff',
  padding: '0.2rem 0.5rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function EmbedCoverPreview({
  componentName,
  variantId,
}: {
  componentName: string;
  variantId: string | null;
}) {
  const trpc = useTRPC();
  const hasSelection = componentName.length > 0 && !!variantId;
  const previewQuery = useQuery({
    ...trpc.componentPreviews.getLatest.queryOptions({
      componentName,
      variantId: variantId ?? '',
    }),
    enabled: hasSelection,
  });

  if (!hasSelection) {
    return (
      <div className="sb-dos-donts-cover-embed" data-preview-state="unset">
        Nenhum componente selecionado
      </div>
    );
  }
  if (previewQuery.isLoading) {
    return (
      <div className="sb-dos-donts-cover-embed" data-preview-state="loading">
        Carregando preview…
      </div>
    );
  }
  if (previewQuery.isError || !previewQuery.data) {
    return (
      <div className="sb-dos-donts-cover-embed" data-preview-state="empty">
        Nenhum preview publicado para{' '}
        <strong>
          {componentName} / {variantId}
        </strong>{' '}
        ainda.
      </div>
    );
  }
  return (
    <iframe
      className="sb-dos-donts-cover-embed-frame"
      data-preview-state="live"
      src={previewQuery.data.url}
      title={`Cover de ${componentName} (${variantId})`}
      loading="lazy"
      // Mesma política de sandbox do component-embed top-level (TASK-47):
      // allow-scripts sem allow-same-origin (artefato de terceiros opaco ao
      // parent — sem acesso a cookies/DOM da sessão do painel).
      sandbox="allow-scripts"
    />
  );
}

export function DosDontsCoverField({
  cover,
  editable,
  onChange,
}: {
  cover: DosDontsCover | null;
  editable: boolean;
  onChange: (cover: DosDontsCover | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!cover) {
    if (!editable) return null;
    return (
      <div className="sb-dos-donts-cover sb-dos-donts-cover--empty" contentEditable={false}>
        <div role="group" aria-label="Adicionar cover" style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            style={actionButtonStyle}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange({ kind: 'image', src: '', alt: '' })}
          >
            🖼️ Adicionar cover de imagem
          </button>
          <button
            type="button"
            style={actionButtonStyle}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPickerOpen(true)}
          >
            🧩 Adicionar cover de componente
          </button>
        </div>
        {pickerOpen && (
          <ComponentEmbedPicker
            onConfirm={(selection) => {
              setPickerOpen(false);
              onChange({
                kind: 'component-embed',
                componentName: selection.componentName,
                variantId: selection.variantId,
              });
            }}
            onCancel={() => setPickerOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="sb-dos-donts-cover" contentEditable={false} data-cover-kind={cover.kind}>
      {cover.kind === 'image' ? (
        <>
          {editable && (
            <div className="sb-dos-donts-cover-image-form">
              <input
                type="text"
                placeholder="URL da imagem"
                aria-label="URL da imagem do cover"
                value={cover.src}
                onChange={(e) => onChange({ ...cover, src: e.target.value })}
              />
              <input
                type="text"
                placeholder="Texto alternativo"
                aria-label="Texto alternativo do cover"
                value={cover.alt}
                onChange={(e) => onChange({ ...cover, alt: e.target.value })}
              />
            </div>
          )}
          {cover.src && <img className="sb-dos-donts-cover-image" src={cover.src} alt={cover.alt} />}
        </>
      ) : (
        <>
          {editable && (
            <button
              type="button"
              style={actionButtonStyle}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPickerOpen(true)}
            >
              {cover.componentName ? 'Trocar componente' : 'Selecionar componente'}
            </button>
          )}
          {pickerOpen && (
            <ComponentEmbedPicker
              initial={cover.componentName && cover.variantId ? { componentName: cover.componentName, variantId: cover.variantId } : null}
              onConfirm={(selection) => {
                setPickerOpen(false);
                onChange({
                  kind: 'component-embed',
                  componentName: selection.componentName,
                  variantId: selection.variantId,
                });
              }}
              onCancel={() => setPickerOpen(false)}
            />
          )}
          <EmbedCoverPreview componentName={cover.componentName} variantId={cover.variantId} />
        </>
      )}
      {editable && (
        <button
          type="button"
          style={actionButtonStyle}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(null)}
        >
          ✕ Remover cover
        </button>
      )}
    </div>
  );
}
