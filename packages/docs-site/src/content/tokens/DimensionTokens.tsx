import type { CSSProperties } from 'react';
import type { Token } from '@systembook/schema';
import { toCssValue } from '@systembook/content/tokens';
import { hasAny, hasPair, pathWords } from './pathWords.js';
import { TokenSample } from './TokenSample.js';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/**
 * O tipo `dimension` não diz se é espaço, raio ou breakpoint: o caminho diz,
 * por palavra inteira. Raio (`radius.md`, `shape.corner.small`,
 * `rounded-lg`) — e não quando o raio é de outra coisa (`shadow.blur-radius`,
 * `focus.ring-radius`), que segue como medida.
 */
const RADIUS_WORDS = new Set(['radius', 'radii', 'rounded', 'round', 'corner', 'corners', 'shape']);
const NOT_RADIUS_WORDS = new Set(['blur', 'ring', 'spread', 'shadow', 'outline']);

/**
 * Largura de traço (SYS-150), se não for raio: `stroke` sozinho (`stroke.md`),
 * ou borda/contorno com uma palavra de espessura (`border.width.thin`,
 * `outline-width`) — `space.border-gap` é espaço, não borda.
 */
const BORDER_WORDS = new Set(['border', 'outline']);
const THICKNESS_WORDS = new Set(['width', 'thickness', 'weight']);

/** Convenções da SYS-154. */
const BREAKPOINT_WORDS = new Set(['breakpoint', 'breakpoints', 'screen', 'screens', 'bp']);
const SQUARE_WORDS = new Set(['avatar', 'avatars']);
const SIZE_WORDS = new Set(['size', 'sizes']);

type Kind = 'radius' | 'border-width' | 'breakpoint' | 'square' | 'letter-spacing' | 'line-height' | 'blur' | 'size';

/** A amostra de uma dimensão, pelas palavras do caminho; a ordem resolve os casos que casam com mais de uma. */
function sampleKind(token: Token): Kind {
  const words = pathWords(token.path);
  if (hasAny(words, RADIUS_WORDS) && !hasAny(words, NOT_RADIUS_WORDS)) return 'radius';
  if (words.includes('stroke') || (hasAny(words, BORDER_WORDS) && hasAny(words, THICKNESS_WORDS))) return 'border-width';
  if (hasAny(words, BREAKPOINT_WORDS)) return 'breakpoint';
  if ((words.includes('icon') && hasAny(words, SIZE_WORDS)) || hasAny(words, SQUARE_WORDS)) return 'square';
  if (hasPair(words, 'letter', 'spacing') || words.includes('tracking')) return 'letter-spacing';
  if (hasPair(words, 'line', 'height') || words.includes('leading')) return 'line-height';
  if (words.includes('blur') && !words.includes('shadow')) return 'blur';
  return 'size';
}

/**
 * Comprimento que a amostra mostra com o tamanho real. `%`, `vw`/`vh` e cia.
 * dependem de um contexto que a célula não tem — a amostra mentiria —, e o que
 * não é comprimento (`auto`, unidade inválida) faria a barra encher a célula.
 */
const ABSOLUTE_LENGTH = /^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|pt|pc|cm|mm|in|q|ch|ex))$/i;

/** Espaçamento entre letras e entrelinha aceitam `em`, relativo à própria fonte; só o espaçamento aceita negativo. */
const TEXT_LENGTH = /^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch|ex))$/i;
const LETTER_SPACING = /^-?(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch|ex))$/i;

/** Em px, para a régua comparar breakpoints; `rem`/`em` a 16px. `null` para o resto. */
function toPx(css: string): number | null {
  const match = /^(\d*\.?\d+)(px|rem|em)$/i.exec(css);
  if (!match) return css === '0' ? 0 : null;
  return Number(match[1]) * (match[2]!.toLowerCase() === 'px' ? 1 : 16);
}

const TEXT_SAMPLE = 'Hamburgefonstiv';

function Sample({ kind, css, longestBreakpoint }: { kind: Kind; css: string; longestBreakpoint: number }) {
  switch (kind) {
    case 'letter-spacing':
      return (
        <span className="sb-token-text-sample" aria-hidden style={{ letterSpacing: css }}>
          {TEXT_SAMPLE}
        </span>
      );
    case 'line-height':
      return (
        <span className="sb-token-text-sample sb-token-text-sample--lines" aria-hidden style={{ lineHeight: css }}>
          {TEXT_SAMPLE} {TEXT_SAMPLE} {TEXT_SAMPLE}
        </span>
      );
    case 'breakpoint': {
      const px = toPx(css);
      if (px === null) return null;
      return (
        <span className="sb-token-ruler" aria-hidden>
          <span className="sb-token-ruler-mark" style={{ '--sb-token-ruler': `${(px / longestBreakpoint) * 100}%` } as CSSProperties} />
        </span>
      );
    }
    default:
      return ABSOLUTE_LENGTH.test(css) ? <TokenSample kind={kind} value={css} /> : null;
  }
}

/**
 * Tokens de dimensão (SYS-135/150/154), cada um com a amostra do que mede:
 * espaçamento como barra com a largura do valor (limitada à célula — o número
 * escrito diz o resto), raio como quadrado arredondado, largura de borda como
 * caixa com a borda, breakpoint como marca numa régua na escala do maior
 * breakpoint da tabela, tamanho de ícone/avatar como quadrado no tamanho real,
 * espaçamento entre letras e entrelinha como texto, e blur como uma forma
 * desfocada. Sem amostra quando ela não seria fiel: valor relativo a um
 * contexto (`%`, `vw`), que não é comprimento, ou negativo fora do texto.
 */
export function DimensionTokens(props: Omit<TokenTableProps, 'preview'>) {
  const longestBreakpoint = Math.max(
    1,
    ...props.tokens.flatMap((token) =>
      token.type === 'dimension' && sampleKind(token) === 'breakpoint'
        ? Object.values(token.byMode).map((v) => toPx(toCssValue('dimension', v.resolvedValue) ?? '') ?? 0)
        : [],
    ),
  );
  return (
    <TokenTable
      {...props}
      preview={(token, _mode, css) => {
        if (css === null || token.type !== 'dimension') return null;
        const kind = sampleKind(token);
        const pattern = kind === 'letter-spacing' ? LETTER_SPACING : kind === 'line-height' ? TEXT_LENGTH : ABSOLUTE_LENGTH;
        const valid = pattern.test(css);
        return valid ? <Sample kind={kind} css={css} longestBreakpoint={longestBreakpoint} /> : null;
      }}
    />
  );
}
