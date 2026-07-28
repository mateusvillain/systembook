import { useRef, useState } from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { Puzzle, TriangleAlert } from 'lucide-react';
import { useTRPC } from '../../../lib/trpc.js';
import { ComponentEmbedPicker } from '../ComponentEmbedPicker.js';
import { ControlsPanel } from '../ControlsPanel.js';

/**
 * Slot de preview de componente. O nó atômico (TASK-29) reserva
 * `componentName`/`variantId` no JSON; a forma persistida não mudou.
 *
 * TASK-47: quando ambos estão preenchidos, o NodeView resolve o artefato
 * publicado mais recente via `componentPreviews.getLatest` e renderiza um
 * `<iframe>` apontando para a rota estática (`/previews/...`, TASK-46). Sem
 * artefato publicado (ou enquanto carrega), cai no placeholder da TASK-29
 * (o polimento do empty-state fica na TASK-51). A UI de seleção de
 * componente/variante vem na TASK-48.
 */

function Placeholder({
  componentName,
  variantId,
  state,
  message,
  control,
}: {
  componentName: string;
  variantId: string | null;
  state: string;
  message: React.ReactNode;
  control: React.ReactNode;
}) {
  return (
    <NodeViewWrapper
      className="sb-component-embed"
      data-component-name={componentName}
      data-variant-id={variantId ?? ''}
      data-preview-state={state}
    >
      <Puzzle aria-hidden size={19} />
      <span className="sb-component-embed-message">{message}</span>
      {control}
    </NodeViewWrapper>
  );
}

function ComponentEmbedView({ node, updateAttributes, editor }: NodeViewProps) {
  const componentName = node.attrs.componentName as string;
  const variantId = node.attrs.variantId as string | null;
  const trpc = useTRPC();
  const [pickerOpen, setPickerOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hasSelection = componentName.length > 0 && !!variantId && variantId.length > 0;

  const previewQuery = useQuery({
    ...trpc.componentPreviews.getLatest.queryOptions({
      componentName,
      variantId: variantId ?? '',
    }),
    enabled: hasSelection,
  });

  // Read-only (doc pública, TASK-50): o mesmo NodeView renderiza fora do editor
  // — o iframe e o painel de controles ficam, mas a (re)seleção de componente
  // não faz sentido, então o controle e o picker só aparecem quando editável.
  const control = !editor.isEditable ? null : (
    <>
      <button
        type="button"
        data-testid="component-embed-reselect"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setPickerOpen(true)}
        className="sb-embed-action-btn"
      >
        {hasSelection ? 'Replace component' : 'Select component'}
      </button>
      {pickerOpen && (
        <ComponentEmbedPicker
          initial={hasSelection ? { componentName, variantId: variantId! } : null}
          onConfirm={(selection) => {
            setPickerOpen(false);
            updateAttributes({
              componentName: selection.componentName,
              variantId: selection.variantId,
            });
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </>
  );

  if (!hasSelection) {
    return (
      <Placeholder
        componentName={componentName}
        variantId={variantId}
        state="unset"
        control={control}
        message={
          componentName ? (
            <>
              Preview of <strong>{componentName}</strong> — select a variant
            </>
          ) : (
            'No component selected'
          )
        }
      />
    );
  }

  if (previewQuery.isLoading) {
    return (
      <Placeholder
        componentName={componentName}
        variantId={variantId}
        state="loading"
        control={control}
        message={
          <>
            Loading preview of <strong>{componentName}</strong>…
          </>
        }
      />
    );
  }

  // Selecionado mas sem artefato publicável (nunca publicado, ou referência
  // defasada/renomeada) — estado visualmente distinto do "não selecionado"
  // (TASK-51). Nunca renderiza um iframe com src inválido.
  if (previewQuery.isError || !previewQuery.data) {
    return (
      <NodeViewWrapper
        className="sb-component-embed sb-component-embed--empty"
        data-component-name={componentName}
        data-variant-id={variantId ?? ''}
        data-preview-state="empty"
      >
        <TriangleAlert aria-hidden size={19} />
        <span className="sb-component-embed-message">
          No preview published for{' '}
          <strong>
            {componentName} / {variantId}
          </strong>{' '}
          yet.
          {editor.isEditable && ' Publish it via the connector in the component repository.'}
        </span>
        {editor.isEditable && (
          <button
            type="button"
            data-testid="component-embed-retry"
            disabled={previewQuery.isFetching}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void previewQuery.refetch()}
            className="sb-embed-action-btn"
          >
            {previewQuery.isFetching ? 'Checking…' : 'Try again'}
          </button>
        )}
        {control}
      </NodeViewWrapper>
    );
  }

  const preview = previewQuery.data;
  const controls = preview.config?.controls ?? [];
  const variantProps =
    preview.config?.variants.find((v) => v.id === variantId)?.props ?? {};

  return (
    <NodeViewWrapper
      className="sb-component-embed sb-component-embed--live"
      data-component-name={componentName}
      data-variant-id={variantId ?? ''}
      data-preview-state="live"
    >
      <div className="sb-component-embed-bar">
        <span className="sb-component-embed-meta">
          <Puzzle aria-hidden size={13} />
          {componentName} / {variantId}
        </span>
        {control}
      </div>
      <iframe
        ref={iframeRef}
        className="sb-component-embed-frame"
        src={preview.url}
        title={`Preview of ${componentName} (${variantId})`}
        loading="lazy"
        /*
         * Política de sandbox (acceptance criteria da TASK-47):
         * - `allow-scripts` é OBRIGATÓRIO — o artefato é o bundle React do
         *   componente de terceiros (buildado pelo CI do time); sem scripts o
         *   iframe renderiza em branco.
         * - `allow-same-origin` é DELIBERADAMENTE omitido. No container único o
         *   preview é servido da mesma origem do painel admin; combinar
         *   allow-scripts + allow-same-origin deixaria o código de terceiros
         *   ler/escrever cookies de sessão e o DOM do parent. Sem
         *   allow-same-origin o browser trata o iframe como origem opaca:
         *   sem acesso a cookies/storage/DOM do parent. Os assets relativos
         *   (`../assets/*.js`) continuam carregando (subresource same-origin) e
         *   o postMessage do preview-kit não depende de same-origin.
         */
        sandbox="allow-scripts"
      />
      {/* key por variante: trocar de variante recarrega o iframe com novas
          props iniciais, então o painel precisa re-semear seus valores. */}
      <ControlsPanel
        key={variantId ?? ''}
        controls={controls}
        variantProps={variantProps}
        iframeRef={iframeRef}
      />
    </NodeViewWrapper>
  );
}

export const ComponentEmbed = Node.create({
  name: 'componentEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      componentName: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-component-name') ?? '',
        renderHTML: (attributes) => ({ 'data-component-name': attributes.componentName }),
      },
      variantId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-variant-id'),
        renderHTML: (attributes) =>
          attributes.variantId === null ? {} : { 'data-variant-id': attributes.variantId },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-component-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-component-embed': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ComponentEmbedView);
  },
});
