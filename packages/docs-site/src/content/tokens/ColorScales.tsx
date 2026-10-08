import type { CSSProperties } from 'react';
import type { Token } from '@systembook/schema';
import { toCssValue } from '@systembook/content/tokens';
import { TokenCopy, useCopyAnnouncer } from './TokenCopy.js';
import type { TokenTableProps } from './TokenTable.js';
import { modesToShow } from './tokenModes.js';

/** Passo de escala: nome só de dígitos (`50`, `600`, `950`). */
const STEP = /^\d+$/;

/** Um passo só não é progressão; dois já são (`red.400`, `red.600`). */
const MIN_STEPS = 2;

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('.'));
const stepOf = (path: string) => path.slice(path.lastIndexOf('.') + 1);

/**
 * Caminhos-pai que são escalas de cor (SYS-153): todas as cores com aquele pai
 * têm nome numérico, e são pelo menos duas. Um pai com uma cor de nome
 * (`palette.white` ao lado de `palette.indigo`) não conta — `white` é filho de
 * `palette`, não de `palette.indigo`. Só as cores entram na conta: um grupo
 * com cor e dimensão de mesmo pai é raro e o resto segue a regra de tipo.
 */
export function colorScaleParents(tokens: readonly Token[]): Set<string> {
  const byParent = new Map<string, Token[]>();
  for (const token of tokens) {
    if (token.type !== 'color' || !token.path.includes('.')) continue;
    const parent = parentOf(token.path);
    byParent.set(parent, [...(byParent.get(parent) ?? []), token]);
  }
  return new Set(
    [...byParent].filter(([, list]) => list.length >= MIN_STEPS && list.every((t) => STEP.test(stepOf(t.path)))).map(([p]) => p),
  );
}

function Step({ token, mode, onAnnounce }: { token: Token; mode: string; onAnnounce: (message: string) => void }) {
  const css = toCssValue('color', token.byMode[mode]!.resolvedValue);
  return (
    <div role="listitem" className="sb-color-scale-step" data-deprecated={token.deprecated ? '' : undefined}>
      <span className="sb-token-color sb-color-scale-swatch" aria-hidden style={css === null ? undefined : ({ '--sb-token-color': css } as CSSProperties)} />
      <span className="sb-color-scale-step-name">
        {stepOf(token.path)}
        {token.deprecated ? <span className="sb-token-deprecated">Deprecated</span> : null}
      </span>
      <code className="sb-token-value">{css ?? JSON.stringify(token.byMode[mode]!.resolvedValue)}</code>
      <TokenCopy path={token.path} onAnnounce={onAnnounce} />
    </div>
  );
}

/**
 * Escalas de cor (SYS-153): uma faixa por escala, os passos lado a lado em
 * ordem numérica — a progressão se lê de uma vez, em vez de uma linha de
 * tabela por passo. Cada passo tem o swatch, o nome, o valor e os botões de
 * copiar (que aparecem no hover/foco, ou sempre em tela de toque). Uma faixa
 * por modo só quando a escala muda com ele.
 */
export function ColorScales({ tokens, modes, label }: Omit<TokenTableProps, 'preview'>) {
  const { announce, region } = useCopyAnnouncer();
  const scales = new Map<string, Token[]>();
  for (const token of tokens) {
    const parent = parentOf(token.path);
    scales.set(parent, [...(scales.get(parent) ?? []), token]);
  }
  return (
    <div className="sb-tokens sb-color-scales" role="group" aria-label={label}>
      {[...scales].map(([parent, steps]) => {
        const ordered = [...steps].sort((a, b) => Number(stepOf(a.path)) - Number(stepOf(b.path)));
        const shown = modesToShow(ordered, modes);
        return (
          <section key={parent} className="sb-color-scale" aria-label={parent}>
            <code className="sb-token-name">{parent}</code>
            {shown.map((mode) => (
              <div key={mode} className="sb-color-scale-mode">
                {shown.length > 1 ? <span className="sb-type-specimen-mode-name">{mode}</span> : null}
                <div role="list" className="sb-color-scale-row" aria-label={shown.length > 1 ? `${parent} (${mode})` : parent}>
                  {ordered.map((token) => (
                    <Step key={token.path} token={token} mode={mode} onAnnounce={announce} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
      {region}
    </div>
  );
}
