import { useState } from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc.js';
import { ComponentEmbedPicker } from '../ComponentEmbedPicker.js';

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
      <span aria-hidden style={{ fontSize: '1.2rem' }}>
        🧩
      </span>
      <span style={{ flex: 1 }}>{message}</span>
      {control}
    </NodeViewWrapper>
  );
}

function ComponentEmbedView({ node, updateAttributes }: NodeViewProps) {
  const componentName = node.attrs.componentName as string;
  const variantId = node.attrs.variantId as string | null;
  const trpc = useTRPC();
  const [pickerOpen, setPickerOpen] = useState(false);

  const hasSelection = componentName.length > 0 && !!variantId && variantId.length > 0;

  const previewQuery = useQuery({
    ...trpc.componentPreviews.getLatest.queryOptions({
      componentName,
      variantId: variantId ?? '',
    }),
    enabled: hasSelection,
  });

  // Controle de (re)seleção via picker (TASK-48, step 4) — disponível em todos
  // os estados, pré-preenchido com a seleção atual ao reabrir.
  const control = (
    <>
      <button
        type="button"
        data-testid="component-embed-reselect"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setPickerOpen(true)}
        style={{
          border: '1px solid #ccc',
          borderRadius: 4,
          background: '#fff',
          padding: '0.2rem 0.5rem',
          fontSize: '0.8rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {hasSelection ? 'Trocar componente' : 'Selecionar componente'}
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
              Preview de <strong>{componentName}</strong> — selecione uma variante
            </>
          ) : (
            'Nenhum componente selecionado'
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
            Carregando preview de <strong>{componentName}</strong>…
          </>
        }
      />
    );
  }

  // Erro de rede ou nenhum artefato publicado para este par → placeholder,
  // nunca um iframe quebrado (TASK-51 detalha o empty-state completo).
  if (previewQuery.isError || !previewQuery.data) {
    return (
      <Placeholder
        componentName={componentName}
        variantId={variantId}
        state="empty"
        control={control}
        message={
          <>
            <strong>{componentName}</strong> / <strong>{variantId}</strong> ainda não tem preview
            publicado — rode o conector no repositório do componente.
          </>
        }
      />
    );
  }

  const preview = previewQuery.data;

  return (
    <NodeViewWrapper
      className="sb-component-embed sb-component-embed--live"
      data-component-name={componentName}
      data-variant-id={variantId ?? ''}
      data-preview-state="live"
    >
      <div className="sb-component-embed-bar">
        <span style={{ color: '#666', fontSize: '0.8rem' }}>
          🧩 {componentName} / {variantId}
        </span>
        {control}
      </div>
      <iframe
        className="sb-component-embed-frame"
        src={preview.url}
        title={`Preview de ${componentName} (${variantId})`}
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
