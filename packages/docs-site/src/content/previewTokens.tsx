import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { PreviewSetTokensMessage } from '@systembook/schema';
import { tokensToCss } from '@systembook/content/tokens';
import { useTokens } from './docsQueries.js';

/**
 * Design tokens no preview (SYS-148): o iframe recebe as variáveis CSS de
 * todos os modos e o modo ativo via `systembook:set-tokens` — contrato do
 * `mount()` do preview-kit (SYS-147). O iframe não guarda nada entre cargas,
 * então a mensagem sai no `load` (o `mount()` já escuta a essa altura), a
 * cada troca de modo e quando os tokens chegam depois do iframe.
 */

/** O docs-site não depende do preview-kit: o literal é anotado contra o schema. */
const SET_TOKENS_MESSAGE_TYPE: PreviewSetTokensMessage['type'] = 'systembook:set-tokens';

export interface PreviewTokens {
  /** Modos do `TokenSet`; vazio sem tokens publicados. */
  modes: string[];
  /** Modo ativo; o primeiro até o leitor escolher outro. */
  mode: string | null;
  setMode: (mode: string) => void;
  /** Para o `onLoad` do iframe: reenvia os tokens a cada carga. */
  onLoad: () => void;
}

export function usePreviewTokens(iframeRef: RefObject<HTMLIFrameElement | null>): PreviewTokens {
  const set = useTokens().data ?? null;
  const css = useMemo(() => (set ? tokensToCss(set) : null), [set]);
  const modes = useMemo(() => set?.modes ?? [], [set]);
  const [chosen, setMode] = useState<string | null>(null);
  // Um modo que sumiu numa publicação nova volta para o primeiro.
  const mode = chosen !== null && modes.includes(chosen) ? chosen : (modes[0] ?? null);

  const send = useCallback(() => {
    if (css === null || mode === null) return;
    const message: PreviewSetTokensMessage = { type: SET_TOKENS_MESSAGE_TYPE, css, mode };
    // targetOrigin '*': o iframe tem origem opaca (sandbox sem allow-same-origin,
    // ver ComponentEmbed); quem valida a origin é o preview-kit — ver ControlsPanel.
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, [css, mode, iframeRef]);

  // Troca de modo e tokens que chegam com o iframe já carregado. Antes do
  // `load` a mensagem se perde sem efeito, e o `onLoad` reenvia.
  useEffect(send, [send]);

  return { modes, mode, setMode, onLoad: send };
}

/** Alterna o modo dos tokens no preview; some sem tokens ou com um modo só. */
export function PreviewModeToggle({ modes, mode, setMode }: Pick<PreviewTokens, 'modes' | 'mode' | 'setMode'>) {
  if (modes.length < 2) return null;
  return (
    <div className="sb-preview-mode" role="group" aria-label="Token mode" data-testid="preview-mode">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          className="sb-preview-mode-option"
          aria-pressed={m === mode}
          // Não tira o foco do editor (mesma regra do ControlsPanel).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setMode(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
