import type { Token } from '@systembook/schema';
import { TokenSample } from './TokenSample.js';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/**
 * O tipo `dimension` não diz se é espaço ou raio: o caminho diz. Raio é um
 * segmento com uma destas palavras inteiras (`radius.md`, `shape.corner.small`,
 * `rounded-lg`) — e não quando o raio é de outra coisa (`shadow.blur-radius`,
 * `focus.ring-radius`), que segue como medida.
 */
const RADIUS_WORDS = new Set(['radius', 'radii', 'rounded', 'round', 'corner', 'corners', 'shape']);
const NOT_RADIUS_WORDS = new Set(['blur', 'ring', 'spread', 'shadow', 'outline']);

/** Palavras de um segmento: `borderRadius`, `border-radius` e `border_radius` → border, radius. */
const words = (segment: string) =>
  segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean);

/**
 * Largura de traço (SYS-150), se não for raio: `stroke` sozinho (`stroke.md`),
 * ou borda/contorno com uma palavra de espessura (`border.width.thin`,
 * `outline-width`) — `space.border-gap` é espaço, não borda.
 */
const BORDER_WORDS = new Set(['border', 'outline']);
const THICKNESS_WORDS = new Set(['width', 'thickness', 'weight']);

const isBorderWidth = (all: string[]) =>
  all.includes('stroke') || (all.some((w) => BORDER_WORDS.has(w)) && all.some((w) => THICKNESS_WORDS.has(w)));

/** A amostra de uma dimensão, pelas palavras do caminho: raio, largura de borda ou medida. */
function sampleKind(token: Token): 'radius' | 'border-width' | 'size' {
  const all = token.path.split('.').flatMap(words);
  if (all.some((w) => RADIUS_WORDS.has(w)) && !all.some((w) => NOT_RADIUS_WORDS.has(w))) return 'radius';
  return isBorderWidth(all) ? 'border-width' : 'size';
}

/**
 * Comprimento que a amostra mostra com o tamanho real. `%`, `vw`/`vh` e cia.
 * dependem de um contexto que a célula não tem — a amostra mentiria —, e o que
 * não é comprimento (`auto`, unidade inválida) faria a barra encher a célula.
 */
const ABSOLUTE_LENGTH = /^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|pt|pc|cm|mm|in|q|ch|ex))$/i;

/**
 * Tokens de dimensão (SYS-135): espaçamento como uma barra com a largura do
 * valor (limitada à célula — o número escrito diz o resto), raio como um
 * quadrado com aquele arredondamento, largura de borda como uma caixa com
 * aquela borda (SYS-150). Sem amostra quando ela não seria fiel:
 * valor negativo, relativo a um contexto (`%`, `vw`) ou que não é comprimento.
 */
export function DimensionTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(token, _mode, css) => {
        if (css === null || token.type !== 'dimension' || !ABSOLUTE_LENGTH.test(css)) return null;
        return <TokenSample kind={sampleKind(token)} value={css} />;
      }}
    />
  );
}
