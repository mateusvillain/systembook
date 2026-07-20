/**
 * Contrato do `*.preview.tsx` — o arquivo que o time consumidor escreve no
 * próprio repo para expor um componente ao preview (PRD seções 4 e 6.5).
 * Este tipo é consumido por três peças independentes: o `connector` (descobre
 * e builda os previews no CI do time), o `preview-kit` (renderiza variantes
 * dentro do iframe) e o painel admin (gera o painel de controles via
 * postMessage). Mantenha-o estável — times externos escrevem arquivos contra
 * este contrato.
 */

/**
 * Uma variante nomeada do componente (ex.: "Primary", "Disabled").
 * `props` são os valores iniciais passados ao componente quando a variante
 * é selecionada; controles interativos podem sobrescrevê-los em runtime.
 */
export interface PreviewVariant {
  /** Identificador estável da variante (referenciado por `component-embed.variantId`). */
  id: string;
  /** Nome exibido no seletor de variantes. */
  label: string;
  /** Valores iniciais de props para esta variante. */
  props: Record<string, unknown>;
}

interface PreviewControlBase<K extends string> {
  kind: K;
  /** Nome da prop do componente que este controle muta em runtime. */
  propName: string;
  /** Rótulo exibido no painel de controles; default é o próprio `propName`. */
  label?: string;
}

/** Campo de texto livre. */
export interface TextPreviewControl extends PreviewControlBase<'text'> {
  defaultValue?: string;
}

/** Toggle booleano. */
export interface BooleanPreviewControl extends PreviewControlBase<'boolean'> {
  defaultValue?: boolean;
}

/** Seleção entre um conjunto fixo de valores. */
export interface SelectPreviewControl extends PreviewControlBase<'select'> {
  options: string[];
  defaultValue?: string;
}

/**
 * Controle interativo exibido junto ao preview. União discriminada por
 * `kind` — o MVP suporta `text`, `boolean` e `select`.
 */
export type PreviewControl =
  | TextPreviewControl
  | BooleanPreviewControl
  | SelectPreviewControl;

/**
 * Default export esperado de um `*.preview.tsx`, ao lado do export nomeado
 * `Preview` com o componente React que o harness monta:
 *
 * ```tsx
 * import { Button } from './button';
 * import type { PreviewConfig } from '@systembook/schema';
 *
 * export function Preview(props: Record<string, unknown>) {
 *   return <Button {...props} />;
 * }
 *
 * export default {
 *   component: 'Button',
 *   variants: [
 *     { id: 'primary', label: 'Primary', props: { variant: 'primary', children: 'Salvar' } },
 *     { id: 'disabled', label: 'Disabled', props: { variant: 'primary', disabled: true } },
 *   ],
 *   controls: [
 *     { kind: 'text', propName: 'children', label: 'Texto' },
 *     { kind: 'boolean', propName: 'disabled' },
 *     { kind: 'select', propName: 'variant', options: ['primary', 'secondary'] },
 *   ],
 * } satisfies PreviewConfig;
 * ```
 */
export interface PreviewConfig {
  /** Nome de exibição do componente (chave usada pelo `component-embed`). */
  component: string;
  variants: PreviewVariant[];
  controls: PreviewControl[];
}
