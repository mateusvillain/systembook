/**
 * Placeholder — a forma final de `PreviewConfig` (variants, controls, etc.)
 * será definida na TASK-37. Existe aqui só para que imports cruzados
 * (server/admin/connector) não quebrem até lá.
 */
export interface PreviewConfig {
  component: string;
  variants: unknown[];
  controls: unknown[];
}
