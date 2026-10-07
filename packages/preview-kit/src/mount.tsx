import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  PreviewConfig,
  PreviewMessage,
  PreviewSetTokensMessage,
  PreviewUpdatePropsMessage,
  TokenModeAttribute,
} from '@systembook/schema';

/** Valor de `type` das mensagens de atualização de props (contrato em @systembook/schema). */
export const UPDATE_PROPS_MESSAGE_TYPE: PreviewUpdatePropsMessage['type'] =
  'systembook:update-props';

/** Valor de `type` da mensagem de design tokens (SYS-147). */
export const SET_TOKENS_MESSAGE_TYPE: PreviewSetTokensMessage['type'] = 'systembook:set-tokens';

/** Atributo do `<html>` com o modo ativo — o dos seletores de `tokensToCss`. */
const TOKEN_MODE_ATTRIBUTE: TokenModeAttribute = 'data-mode';

/** Marca o `<style>` das variáveis, para a próxima mensagem trocar o mesmo. */
const TOKENS_STYLE_ATTRIBUTE = 'data-systembook-tokens';

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

function asPreviewMessage(data: unknown): PreviewMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const candidate = data as Record<string, unknown>;
  if (
    candidate.type === UPDATE_PROPS_MESSAGE_TYPE &&
    typeof candidate.props === 'object' &&
    candidate.props !== null
  ) {
    return candidate as unknown as PreviewUpdatePropsMessage;
  }
  if (
    candidate.type === SET_TOKENS_MESSAGE_TYPE &&
    typeof candidate.css === 'string' &&
    typeof candidate.mode === 'string'
  ) {
    return candidate as unknown as PreviewSetTokensMessage;
  }
  return null;
}

/**
 * Aplica os tokens no documento do iframe: um `<style>` só no `<head>` (o
 * conteúdo é trocado a cada mensagem, via `textContent` — nada é lido como
 * HTML) e o modo no `<html>`, onde os seletores `[data-mode]` o encontram.
 */
function applyTokens({ css, mode }: PreviewSetTokensMessage) {
  let style = document.head.querySelector<HTMLStyleElement>(`style[${TOKENS_STYLE_ATTRIBUTE}]`);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute(TOKENS_STYLE_ATTRIBUTE, '');
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
  document.documentElement.setAttribute(TOKEN_MODE_ATTRIBUTE, mode);
}

function removeTokens() {
  document.head.querySelector(`style[${TOKENS_STYLE_ATTRIBUTE}]`)?.remove();
  document.documentElement.removeAttribute(TOKEN_MODE_ATTRIBUTE);
}

/**
 * Monta o preview de uma variante dentro de `rootElement` e fica escutando
 * mensagens do pai: `systembook:update-props` re-renderiza o componente com
 * props mescladas, e `systembook:set-tokens` aplica as variáveis CSS dos
 * design tokens e o modo ativo (SYS-147) — é o runtime que o connector bundla
 * no artefato (TASK-41) e que o painel de controles do admin dirige via
 * postMessage (TASK-49).
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
    const message = asPreviewMessage(event.data);
    if (!message) return;
    if (event.origin !== allowedOrigin) {
      console.warn(
        `[preview-kit] mensagem ${message.type} ignorada — origin "${event.origin}" não é a permitida ("${allowedOrigin}")`,
      );
      return;
    }
    if (message.type === SET_TOKENS_MESSAGE_TYPE) {
      applyTokens(message);
      return;
    }
    currentProps = { ...currentProps, ...message.props };
    root.render(<Component {...currentProps} />);
  };

  window.addEventListener('message', onMessage);
  root.render(<Component {...currentProps} />);

  return {
    unmount() {
      window.removeEventListener('message', onMessage);
      removeTokens();
      root.unmount();
    },
  };
}
