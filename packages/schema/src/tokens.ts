/**
 * Design tokens normalizados (projeto "Design tokens", SYS-123).
 *
 * A fonte da verdade são arquivos no formato DTCG (Design Tokens Community
 * Group, W3C) no repo do design system. `@systembook/content/tokens` lê esses
 * arquivos, resolve aliases e modos e devolve um `TokenSet` — o formato que
 * trafega daqui em diante: embutido no site estático, gravado pelo server no
 * modo CMS e lido pela doc pública via `DocsDataSource`.
 *
 * Mapeamento com a spec DTCG:
 * - grupos aninhados viram o `path` com pontos (`color.brand.500`) — a spec
 *   proíbe `.`, `{` e `}` nos nomes, então o `path` é inequívoco;
 * - `$type` é o do próprio token, senão o do grupo mais próximo, senão o do
 *   token apontado pelo alias;
 * - `$value`, `$description`, `$deprecated` e `$extensions` passam adiante;
 * - modos (light/dark, marcas) não existem no formato de token da spec: cada
 *   modo vem de arquivos próprios, sobrepostos aos arquivos base.
 */

/**
 * Tipos de token da spec DTCG: os primitivos (`color` … `number`) e os
 * compostos (`strokeStyle` … `typography`), cujos valores são objetos ou
 * listas com campos dos tipos primitivos.
 */
export type TokenType =
  | 'color'
  | 'dimension'
  | 'fontFamily'
  | 'fontWeight'
  | 'duration'
  | 'cubicBezier'
  | 'number'
  | 'strokeStyle'
  | 'border'
  | 'transition'
  | 'shadow'
  | 'gradient'
  | 'typography';

/**
 * Valor de um token como JSON. O formato depende do `type` (ver os tipos
 * `*TokenValue` abaixo), mas nada aqui o garante: quem produz o `TokenSet`
 * valida, quem consome confere o formato que vai usar.
 */
export type TokenValue =
  | string
  | number
  | boolean
  | null
  | TokenValue[]
  | { [key: string]: TokenValue };

/** Cor na forma de objeto da spec. A forma legada é uma string CSS (`#0a84ff`). */
export interface ColorTokenValue {
  colorSpace: string;
  components: (number | 'none')[];
  alpha?: number;
  /** Fallback hexadecimal, quando o arquivo traz. */
  hex?: string;
}

/** Dimensão ou duração na forma de objeto. A forma legada é uma string (`16px`, `200ms`). */
export interface MeasureTokenValue {
  value: number;
  unit: string;
}

/** Um design token, com o valor de cada modo. */
export interface Token {
  /** Caminho do token com pontos, a partir da raiz: `color.brand.500`. */
  path: string;
  type: TokenType;
  description?: string;
  /** `true`, ou a explicação do que usar no lugar. */
  deprecated?: boolean | string;
  /**
   * Valor por modo como está no arquivo — pode ser um alias (`{color.blue.500}`)
   * ou conter aliases em campos de um valor composto. Tem uma chave para cada
   * modo de `TokenSet.modes`.
   */
  values: Record<string, TokenValue>;
  /** Valor por modo com todos os aliases substituídos. Mesmas chaves de `values`. */
  resolved: Record<string, TokenValue>;
  /**
   * Token apontado, por modo, quando o valor inteiro é um alias. Só a primeira
   * referência (não o fim da cadeia): é o que a doc mostra como "→ color.blue.500".
   */
  aliasOf?: Record<string, string>;
  /** `$extensions` do token, intocado (dados de ferramentas de terceiros). */
  extensions?: Record<string, TokenValue>;
}

/** Conjunto de tokens de um design system. */
export interface TokenSet {
  /**
   * Modos na ordem em que aparecem nas fontes. Nunca vazio: sem arquivos por
   * modo, há um único modo `default`.
   */
  modes: string[];
  /** Tokens na ordem em que aparecem nos arquivos. */
  tokens: Token[];
}
