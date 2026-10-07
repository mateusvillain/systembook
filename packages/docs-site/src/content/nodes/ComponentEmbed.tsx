import { useRef, type ComponentType } from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Puzzle, TriangleAlert } from 'lucide-react';
import { hasPreviewSelection, useComponentPreview } from '../docsQueries.js';
import { ControlsPanel } from '../ControlsPanel.js';
import { PreviewModeToggle, usePreviewTokens } from '../previewTokens.js';

/**
 * Slot de preview de componente. O nó atômico (TASK-29) reserva
 * `componentName`/`variantId` no JSON; a forma persistida não mudou.
 *
 * TASK-47: quando ambos estão preenchidos, o NodeView resolve o artefato
 * publicado mais recente via `DocsDataSource.getComponentPreview` e renderiza
 * um `<iframe>` apontando para o artefato estático. Sem artefato publicado (ou
 * enquanto carrega), cai no placeholder da TASK-29 (o polimento do empty-state
 * fica na TASK-51).
 *
 * Este é o NodeView de **renderização** (SYS-89): não conhece o picker nem a
 * API do painel. A (re)seleção de componente (TASK-48) é injetada pelo editor
 * via a opção `EditControls`, que só aparece quando o editor é editável.
 */

/** Estado do embed exposto aos controles de edição. */
export type ComponentEmbedState = 'unset' | 'loading' | 'empty' | 'live';

export interface ComponentEmbedEditControlsProps {
  componentName: string;
  variantId: string | null;
  state: ComponentEmbedState;
  /** Nova tentativa de resolver o preview (estado `empty`). */
  onRetry: () => void;
  retrying: boolean;
  onSelect: (selection: { componentName: string; variantId: string }) => void;
}

export interface ComponentEmbedOptions {
  /** Controles de edição; `null` na renderização read-only. */
  EditControls: ComponentType<ComponentEmbedEditControlsProps> | null;
}

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

function ComponentEmbedView({ node, updateAttributes, editor, extension }: NodeViewProps) {
  const componentName = node.attrs.componentName as string;
  const variantId = node.attrs.variantId as string | null;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hasSelection = hasPreviewSelection(componentName, variantId);

  const previewQuery = useComponentPreview(componentName, variantId);
  const tokens = usePreviewTokens(iframeRef);

  const state: ComponentEmbedState = !hasSelection
    ? 'unset'
    : previewQuery.isLoading
      ? 'loading'
      : previewQuery.isError || !previewQuery.data
        ? 'empty'
        : 'live';

  // Read-only (doc pública, TASK-50): o iframe e o painel de controles ficam,
  // mas a (re)seleção de componente não faz sentido — os controles só existem
  // quando o editor é editável e os injetou.
  const { EditControls } = extension.options as ComponentEmbedOptions;
  const control =
    editor.isEditable && EditControls ? (
      <EditControls
        componentName={componentName}
        variantId={variantId}
        state={state}
        onRetry={() => void previewQuery.refetch()}
        retrying={previewQuery.isFetching}
        onSelect={(selection) =>
          updateAttributes({
            componentName: selection.componentName,
            variantId: selection.variantId,
          })
        }
      />
    ) : null;

  if (state === 'unset') {
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

  if (state === 'loading') {
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
  // `!data` é só para o TS estreitar o tipo — em `live` ele sempre existe.
  if (state === 'empty' || !previewQuery.data) {
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
        <span className="sb-component-embed-actions">
          <PreviewModeToggle modes={tokens.modes} mode={tokens.mode} setMode={tokens.setMode} />
          {control}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        className="sb-component-embed-frame"
        src={preview.url}
        title={`Preview of ${componentName} (${variantId})`}
        loading="lazy"
        onLoad={tokens.onLoad}
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

export const ComponentEmbed = Node.create<ComponentEmbedOptions>({
  name: 'componentEmbed',
  group: 'block',
  atom: true,

  addOptions() {
    return { EditControls: null };
  },

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
