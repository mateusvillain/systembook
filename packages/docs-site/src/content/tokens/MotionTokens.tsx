import { useState, type CSSProperties } from 'react';
import { Play } from 'lucide-react';
import type { Token, TokenValue } from '@systembook/schema';
import { toCssValue } from '@systembook/content/tokens';
import { TokenTable, type TokenTableProps } from './TokenTable.js';
import { modesForToken, modesToShow } from './tokenModes.js';

/**
 * Tokens de movimento (SYS-151): `cubicBezier`, `duration` e `transition`
 * dividem uma tabela. A curva vira um gráfico (tempo × progresso, com as alças
 * dos pontos de controle) e a duração uma barra na escala da maior duração da
 * tabela — as duas paradas, que é o que informa. O movimento em si fica num
 * trilho com um botão "play": um ponto anda com a curva, a duração e o atraso
 * do token. Nada anima sozinho, e com `prefers-reduced-motion` o trilho some
 * (`content.css`).
 */

type Bezier = [number, number, number, number];

/** As palavras-chave de easing do CSS como curvas — `steps()` não é curva e fica sem gráfico. */
const KEYWORDS: Record<string, Bezier> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/** `cubic-bezier(a, b, c, d)` ou palavra-chave → os quatro números; `null` para o resto. */
export function parseEasing(css: string): Bezier | null {
  const keyword = KEYWORDS[css.trim().toLowerCase()];
  if (keyword) return keyword;
  const match = /^cubic-bezier\(([^)]*)\)$/i.exec(css.trim());
  const numbers = match?.[1]!.split(',').map((n) => Number(n.trim()));
  if (numbers?.length !== 4 || !numbers.every(Number.isFinite)) return null;
  // x fora de [0, 1] não é uma curva de easing válida.
  return numbers[0]! < 0 || numbers[0]! > 1 || numbers[2]! < 0 || numbers[2]! > 1 ? null : (numbers as Bezier);
}

/** `200ms` / `0.2s` → milissegundos; `null` para o que não for tempo. */
export function parseDurationMs(css: string): number | null {
  const match = /^(\d*\.?\d+)(ms|s)$/i.exec(css.trim());
  if (!match) return null;
  return Number(match[1]) * (match[2]!.toLowerCase() === 's' ? 1000 : 1);
}

interface Motion {
  /** A curva, quando há uma (`cubicBezier` e `transition`). */
  bezier: Bezier | null;
  easing: string;
  durationMs: number | null;
  delayMs: number;
}

/** Duração do trilho para uma curva sem tempo próprio (`cubicBezier`): o bastante para ler a forma. */
const CURVE_PREVIEW_MS = 800;

function motionOf(token: Token, value: TokenValue, css: string | null): Motion | null {
  if (css === null) return null;
  if (token.type === 'cubicBezier') {
    const bezier = parseEasing(css);
    return bezier && { bezier, easing: css, durationMs: null, delayMs: 0 };
  }
  if (token.type === 'duration') {
    const durationMs = parseDurationMs(css);
    return durationMs === null ? null : { bezier: null, easing: 'linear', durationMs, delayMs: 0 };
  }
  if (token.type === 'transition' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const easing = toCssValue('cubicBezier', value.timingFunction ?? null);
    const duration = toCssValue('duration', value.duration ?? null);
    const delay = toCssValue('duration', value.delay ?? 0);
    const durationMs = duration === null ? null : parseDurationMs(duration);
    const delayMs = delay === null ? null : parseDurationMs(delay);
    if (easing === null || durationMs === null || delayMs === null) return null;
    return { bezier: parseEasing(easing), easing, durationMs, delayMs };
  }
  return null;
}

/**
 * O gráfico da curva: x é o tempo, y o progresso (para cima), com folga para
 * curvas que passam de 0 ou 1 — até um limite, para uma alça extrema não
 * esticar a linha da tabela; o que passa dele transborda o SVG.
 */
function Curve({ bezier: [x1, y1, x2, y2] }: { bezier: Bezier }) {
  const pad = 0.1;
  const low = Math.max(-1, Math.min(0, y1, y2));
  const high = Math.min(2, Math.max(1, y1, y2));
  return (
    <svg className="sb-token-curve" viewBox={`${-pad} ${-high - pad} ${1 + 2 * pad} ${high - low + 2 * pad}`} aria-hidden>
      <rect className="sb-token-curve-frame" x={0} y={-1} width={1} height={1} />
      <line className="sb-token-curve-handle" x1={0} y1={0} x2={x1} y2={-y1} />
      <line className="sb-token-curve-handle" x1={1} y1={-1} x2={x2} y2={-y2} />
      <path className="sb-token-curve-path" d={`M0 0 C ${x1} ${-y1} ${x2} ${-y2} 1 -1`} />
    </svg>
  );
}

/** O trilho: cada clique em "play" remonta o ponto, que reinicia a animação. */
function Run({ motion, label }: { motion: Motion; label: string }) {
  const [run, setRun] = useState(0);
  const style = {
    '--sb-motion-easing': motion.easing,
    '--sb-motion-duration': `${motion.durationMs ?? CURVE_PREVIEW_MS}ms`,
    '--sb-motion-delay': `${motion.delayMs}ms`,
  } as CSSProperties;
  return (
    <span className="sb-token-motion-run">
      <button
        type="button"
        className="sb-token-motion-play"
        aria-label={`Play ${label}`}
        // Não tira o foco do editor quando a tabela está no ProseMirror.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setRun((n) => n + 1)}
      >
        <Play aria-hidden size={11} />
      </button>
      <span className="sb-token-motion-track" aria-hidden>
        <span key={run} className="sb-token-motion-dot" data-running={run > 0 ? '' : undefined} style={style} />
      </span>
    </span>
  );
}

export function MotionTokens(props: Omit<TokenTableProps, 'preview'>) {
  // Quando a linha tem uma célula por modo, o modo entra no nome do botão: senão os dois "play" se chamam igual.
  const shown = modesToShow(props.tokens, props.modes);
  // A barra de duração mede contra a maior duração da tabela, para comparar as linhas.
  const longest = Math.max(
    1,
    ...props.tokens.flatMap((token) =>
      token.type === 'duration'
        ? Object.values(token.byMode).map((v) => parseDurationMs(toCssValue('duration', v.resolvedValue) ?? '') ?? 0)
        : [],
    ),
  );
  return (
    <TokenTable
      {...props}
      preview={(token, mode, css) => {
        const motion = motionOf(token, token.byMode[mode]!.resolvedValue, css);
        if (!motion) return null;
        return (
          <span className="sb-token-motion">
            {motion.bezier ? <Curve bezier={motion.bezier} /> : null}
            {token.type === 'duration' ? (
              <span
                className="sb-token-duration"
                aria-hidden
                style={{ '--sb-token-duration': `${(motion.durationMs! / longest) * 100}%` } as CSSProperties}
              />
            ) : null}
            <Run motion={motion} label={modesForToken(token, shown).length > 1 ? `${token.path} (${mode})` : token.path} />
          </span>
        );
      }}
    />
  );
}
