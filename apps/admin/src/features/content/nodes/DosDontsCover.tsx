import type { DosDontsCover } from '@systembook/schema';
import { hasPreviewSelection, useComponentPreview } from '../docsQueries.js';

/**
 * Renderização do cover do bloco dos-donts (TASK-73, separada da edição na
 * SYS-89): opcional, imagem OU component-embed. A resolução do embed
 * (loading/empty/live) **duplica deliberadamente** a máquina de estados de
 * `ComponentEmbed.tsx` (TASK-47/51) em vez de extrair um helper compartilhado
 * — a superfície do component-embed top-level já é validada por E2E das
 * TASK-47/48/51 e extrair alteraria seu DOM; mantenha os dois em sincronia se
 * a máquina de estados mudar. Diferente do embed top-level, o cover não expõe
 * o painel de controles interativos (`ControlsPanel`) — é um slot de apoio
 * visual, não o embed principal da página.
 */

export function EmbedCoverPreview({
  componentName,
  variantId,
}: {
  componentName: string;
  variantId: string | null;
}) {
  const hasSelection = hasPreviewSelection(componentName, variantId);
  const previewQuery = useComponentPreview(componentName, variantId);

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
      title={`Cover of ${componentName} (${variantId})`}
      loading="lazy"
      // Mesma política de sandbox do component-embed top-level (TASK-47):
      // allow-scripts sem allow-same-origin (artefato de terceiros opaco ao
      // parent — sem acesso a cookies/DOM da sessão do painel).
      sandbox="allow-scripts"
    />
  );
}

/** Props do campo de cover; o editor injeta a versão editável com a mesma forma. */
export interface DosDontsCoverFieldProps {
  cover: DosDontsCover | null;
  editable: boolean;
  onChange: (cover: DosDontsCover | null) => void;
}

/** Cover read-only: nada sem cover; imagem ou preview do componente com ele. */
export function DosDontsCoverView({ cover }: DosDontsCoverFieldProps) {
  if (!cover) return null;
  return (
    <div className="sb-dos-donts-cover" contentEditable={false} data-cover-kind={cover.kind}>
      {cover.kind === 'image' ? (
        cover.src && <img className="sb-dos-donts-cover-image" src={cover.src} alt={cover.alt} />
      ) : (
        <EmbedCoverPreview componentName={cover.componentName} variantId={cover.variantId} />
      )}
    </div>
  );
}
