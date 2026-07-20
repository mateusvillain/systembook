import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type { PreviewConfig, PreviewUpdatePropsMessage } from '@systembook/schema';

/** Valor de `type` das mensagens de atualização de props (contrato em @systembook/schema). */
export const UPDATE_PROPS_MESSAGE_TYPE: PreviewUpdatePropsMessage['type'] =
  'systembook:update-props';

export interface MountOptions {
  /** Variante inicial a renderizar — deve casar com um `id` de `config.variants`. */
  variantId: string;
  /**
   * Origin de onde aceitar mensagens `postMessage`. Quando omitida, cai para a
   * origin do `document.referrer` (a página que embeda o iframe) e, sem
   * referrer, para a própria origin da janela. Mensagens de qualquer outra
   * origin são ignoradas com um `console.warn`.
   */
  allowedOrigin?: string;
}

export interface PreviewHandle {
  /** Desmonta o preview e remove o listener de mensagens. */
  unmount(): void;
}

function resolveAllowedOrigin(explicit: string | undefined): string {
  if (explicit) return explicit;
  if (document.referrer) return new URL(document.referrer).origin;
  return window.location.origin;
}

function isUpdatePropsMessage(data: unknown): data is PreviewUpdatePropsMessage {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return (
    candidate.type === UPDATE_PROPS_MESSAGE_TYPE &&
    typeof candidate.props === 'object' &&
    candidate.props !== null
  );
}

/**
 * Monta o preview de uma variante dentro de `rootElement` e fica escutando
 * mensagens `systembook:update-props` do pai para re-renderizar o componente
 * com props mescladas — é o runtime que o connector bundla no artefato (TASK-41)
 * e que o painel de controles do admin dirige via postMessage (TASK-49).
 */
export function mount(
  rootElement: HTMLElement,
  config: PreviewConfig,
  Component: ComponentType<Record<string, unknown>>,
  options: MountOptions,
): PreviewHandle {
  const root = createRoot(rootElement);

  const variant = config.variants.find((v) => v.id === options.variantId);
  if (!variant) {
    const knownIds = config.variants.map((v) => v.id).join(', ') || '(nenhuma)';
    root.render(
      <div role="alert" data-preview-error>
        Variante &quot;{options.variantId}&quot; não encontrada para o componente &quot;
        {config.component}&quot;. Variantes disponíveis: {knownIds}.
      </div>,
    );
    return { unmount: () => root.unmount() };
  }

  let currentProps: Record<string, unknown> = { ...variant.props };
  const allowedOrigin = resolveAllowedOrigin(options.allowedOrigin);

  const onMessage = (event: MessageEvent) => {
    if (!isUpdatePropsMessage(event.data)) return;
    if (event.origin !== allowedOrigin) {
      console.warn(
        `[preview-kit] mensagem systembook:update-props ignorada — origin "${event.origin}" não é a permitida ("${allowedOrigin}")`,
      );
      return;
    }
    currentProps = { ...currentProps, ...event.data.props };
    root.render(<Component {...currentProps} />);
  };

  window.addEventListener('message', onMessage);
  root.render(<Component {...currentProps} />);

  return {
    unmount() {
      window.removeEventListener('message', onMessage);
      root.unmount();
    },
  };
}
