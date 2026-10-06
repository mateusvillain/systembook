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

function isRadiusToken(token: Token): boolean {
  const all = token.path.split('.').flatMap(words);
  return all.some((w) => RADIUS_WORDS.has(w)) && !all.some((w) => NOT_RADIUS_WORDS.has(w));
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
 * quadrado com aquele arredondamento. Sem amostra quando ela não seria fiel:
 * valor negativo, relativo a um contexto (`%`, `vw`) ou que não é comprimento.
 */
export function DimensionTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(token, _mode, css) => {
        if (css === null || token.type !== 'dimension' || !ABSOLUTE_LENGTH.test(css)) return null;
        return <TokenSample kind={isRadiusToken(token) ? 'radius' : 'size'} value={css} />;
      }}
    />
  );
}
