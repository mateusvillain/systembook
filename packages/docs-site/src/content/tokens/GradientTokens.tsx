import { TokenSample } from './TokenSample.js';
import { TokenTable, type TokenTableProps } from './TokenTable.js';

/**
 * Gradientes (SYS-152): uma faixa com o gradiente. O DTCG guarda só as
 * paradas, não a direção: a faixa usa os 90deg da conversão para CSS, e o
 * produto escolhe a sua.
 */
export function GradientTokens(props: Omit<TokenTableProps, 'preview'>) {
  return (
    <TokenTable
      {...props}
      preview={(token, _mode, css) => (css === null || token.type !== 'gradient' ? null : <TokenSample kind="gradient" value={css} />)}
    />
  );
}
