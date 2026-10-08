import type { Token } from '@systembook/schema';

/**
 * Modos que valem uma coluna (SYS-149): todos, se algum token muda de valor ou
 * de alias entre eles; senão só o primeiro — tipografia, espaço e raio quase
 * nunca mudam com o tema, e repetir o mesmo valor em light e dark só faz
 * ruído. A decisão é da tabela inteira, para as colunas alinharem.
 */
export function modesToShow(tokens: readonly Token[], modes: readonly string[]): readonly string[] {
  const [first] = modes;
  if (first === undefined || modes.length === 1) return modes;
  const key = (token: Token, mode: string) => {
    const entry = token.byMode[mode];
    return JSON.stringify([entry?.resolvedValue ?? null, entry?.aliasOf ?? null]);
  };
  const varies = tokens.some((token) => modes.some((mode) => key(token, mode) !== key(token, first)));
  return varies ? modes : [first];
}
