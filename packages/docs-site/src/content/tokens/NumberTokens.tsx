import type { CSSProperties } from 'react';
import type { Token } from '@systembook/schema';
import { hasAny, hasPair, pathWords } from './pathWords.js';
import { TokenSample } from './TokenSample.js';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/** `number` não diz o que mede: o caminho diz, por palavra inteira. */
const OPACITY_WORDS = new Set(['opacity', 'alpha']);
const LAYER_WORDS = new Set(['layer', 'layers', 'zindex']);

type Kind = 'opacity' | 'layer' | 'line-height' | 'aspect-ratio' | null;

function kindOf(token: Token): Kind {
  const words = pathWords(token.path);
  if (hasAny(words, OPACITY_WORDS)) return 'opacity';
  if (hasAny(words, LAYER_WORDS) || hasPair(words, 'z', 'index')) return 'layer';
  if (hasPair(words, 'line', 'height') || words.includes('leading')) return 'line-height';
  // `ratio` sozinho não: `contrast.ratio.aa` é um número de contraste, não uma proporção.
  if (words.includes('aspect') || words.includes('aspectratio')) return 'aspect-ratio';
  return null;
}

/** Faixa em que cada amostra é honesta; fora dela, só o valor. */
const RANGE: Record<Exclude<Kind, null>, [min: number, max: number]> = {
  opacity: [0, 1],
  layer: [-Infinity, Infinity],
  'line-height': [0.5, 4],
  'aspect-ratio': [0.1, 10],
};

/** Camadas desenhadas na pilha, no máximo — com mais, as de cima se juntam na última. */
const MAX_LAYERS = 8;

/** A pilha: uma camada por valor distinto da tabela, a do token destacada. */
function LayerStack({ rank, count }: { rank: number; count: number }) {
  const layers = Math.min(count, MAX_LAYERS);
  const highlighted = Math.min(rank, layers - 1);
  return (
    <span className="sb-token-stack" aria-hidden style={{ '--sb-token-stack-layers': layers } as CSSProperties}>
      {Array.from({ length: layers }, (_, i) => (
        <span key={i} className="sb-token-stack-layer" data-current={i === highlighted ? '' : undefined} style={{ '--sb-token-stack-i': i } as CSSProperties} />
      ))}
    </span>
  );
}

/**
 * Tokens numéricos (SYS-150/154), com a amostra do que medem: opacidade como
 * a cor de destaque naquela opacidade sobre xadrez; z-index/camada como uma
 * pilha com a camada do token destacada (pela ordem dos valores da tabela);
 * entrelinha como texto em várias linhas; proporção como um retângulo
 * naquela proporção. Os outros números não têm amostra honesta: só o valor.
 */
export function NumberTokens(props: Omit<TokenTableProps, 'preview'>) {
  // Os valores distintos de camada da tabela, em ordem: a posição de cada um é a altura na pilha.
  const layerValues = [
    ...new Set(
      props.tokens.flatMap((token) =>
        token.type === 'number' && kindOf(token) === 'layer' ? Object.values(token.byMode).map((v) => v.resolvedValue as number) : [],
      ),
    ),
  ].sort((a, b) => a - b);

  return (
    <TokenTable
      {...props}
      preview={(token, mode, css) => {
        if (css === null || token.type !== 'number') return null;
        const kind = kindOf(token);
        // O valor do token, não o CSS: a conversão arredonda (`1.23456` → `1.2346`) e a pilha procura o valor exato.
        const n = token.byMode[mode]!.resolvedValue as number;
        if (kind === null || !Number.isFinite(n) || n < RANGE[kind][0] || n > RANGE[kind][1]) return null;
        switch (kind) {
          case 'opacity':
            return <TokenSample kind="opacity" value={css} />;
          case 'layer':
            return <LayerStack rank={layerValues.indexOf(n)} count={layerValues.length} />;
          case 'line-height':
            return (
              <span className="sb-token-text-sample sb-token-text-sample--lines" aria-hidden style={{ lineHeight: css }}>
                Hamburgefonstiv Hamburgefonstiv Hamburgefonstiv
              </span>
            );
          case 'aspect-ratio':
            return <TokenSample kind="aspect-ratio" value={css} />;
        }
      }}
    />
  );
}
