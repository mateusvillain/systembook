/**
 * Design tokens normalizados (projeto "Design tokens", SYS-123).
 *
 * A fonte da verdade são arquivos no formato DTCG (Design Tokens Community
 * Group, W3C) no repo do design system. O parser de tokens lê esses arquivos,
 * resolve aliases e modos e devolve um `TokenSet` — o formato que trafega
 * daqui em diante: embutido no site estático, gravado pelo server no modo CMS
 * e lido pela doc pública via `DocsDataSource`.
 *
 * Mapeamento com a spec DTCG:
 * - grupos aninhados viram o `path` com pontos (`color.brand.500`) — a spec
 *   proíbe `.`, `{` e `}` nos nomes, então o `path` é inequívoco;
 * - `$type` é o do próprio token, senão o do grupo mais próximo, senão o do
 *   token apontado pelo alias;
 * - aliases são os da forma `{color.brand.500}`, no valor inteiro ou em campos
 *   de um valor composto;
 * - `$value`, `$description` e `$deprecated` passam adiante.
 *
 * Modos (light/dark, marcas) são decisão do Systembook, não da spec de
 * tokens: cada modo vem de arquivos próprios, sobrepostos aos arquivos base —
 * o que o export de variáveis do Figma gera (um arquivo por modo) e o que o
 * módulo Resolver do DTCG compõe. O alias é resolvido dentro do modo.
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
 * Valor de um token como JSON. O formato depende do `type` e da versão da
 * spec que o arquivo segue (`"#0a84ff"` ou `{ colorSpace, components }`); o
 * parser valida o formato, e quem consome interpreta o que vai usar.
 */
export type TokenValue =
  | string
  | number
  | boolean
  | null
  | TokenValue[]
  | { [key: string]: TokenValue };

/** O valor de um token num modo. */
export interface TokenModeValue {
  /** Como está no arquivo: pode ser um alias ou conter aliases. */
  value: TokenValue;
  /** Com todos os aliases substituídos. */
  resolvedValue: TokenValue;
  /**
   * Token apontado quando o valor inteiro é um alias. Só a primeira referência
   * (não o fim da cadeia): é o que a doc mostra como "→ color.blue.500".
   */
  aliasOf?: string;
}

/** Um design token, com o valor de cada modo. */
export interface Token {
  /** Caminho do token com pontos, a partir da raiz: `color.brand.500`. */
  path: string;
  type: TokenType;
  description?: string;
  /** `true`, ou a explicação do que usar no lugar. */
  deprecated?: boolean | string;
  /** Valor em cada modo, com uma chave para cada modo de `TokenSet.modes`. */
  byMode: Record<string, TokenModeValue>;
}

/**
 * Conjunto de tokens de um design system. Só tem tokens válidos e completos:
 * um token com erro (alias quebrado, valor inválido, modo faltando) fica de
 * fora e vira diagnóstico do parser.
 */
export interface TokenSet {
  /**
   * Modos na ordem em que aparecem nas fontes. Nunca vazio: sem arquivos por
   * modo, há um único modo `default`.
   */
  modes: string[];
  /** Tokens na ordem em que aparecem nos arquivos. */
  tokens: Token[];
}
