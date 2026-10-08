import type { Token } from '@systembook/schema';

/**
 * Modos que valem uma coluna (SYS-149): todos, se algum token muda de valor ou
 * de alias entre eles; senão só o primeiro — tipografia, espaço e raio quase
 * nunca mudam com o tema, e repetir o mesmo valor em light e dark só faz
 * ruído. A decisão é da tabela inteira, para as colunas alinharem.
 */
export function modesToShow(tokens: readonly Token[], modes: readonly string[]): readonly string[] {
  return tokens.some((token) => varies(token, modes)) ? modes : modes.slice(0, 1);
}

/** Valor e alias de um token num modo, para comparar. */
const key = (token: Token, mode: string) => {
  const entry = token.byMode[mode];
  return JSON.stringify([entry?.resolvedValue ?? null, entry?.aliasOf ?? null]);
};

const varies = (token: Token, modes: readonly string[]) => modes.some((mode) => key(token, mode) !== key(token, modes[0]!));

/**
 * Os modos de uma linha (SYS-152): os da tabela, ou só o primeiro quando o
 * token é igual em todos — a linha ocupa as colunas de modo numa célula só, em
 * vez de repetir o valor porque outro token da tabela muda com o tema.
 */
export function modesForToken(token: Token, shown: readonly string[]): readonly string[] {
  return shown.length > 1 && !varies(token, shown) ? shown.slice(0, 1) : shown;
}
