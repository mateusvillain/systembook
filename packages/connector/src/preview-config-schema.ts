import { z } from 'zod';
import type { PreviewConfig } from '@systembook/schema';

/**
 * Espelho zod de `PreviewConfig` (@systembook/schema) para validação em
 * runtime dos default exports de `*.preview.tsx` — o pacote schema é
 * types-only, então o validador vive aqui (mesmo padrão do `BLOCK_TYPES`
 * no server). A anotação `z.ZodType<PreviewConfig>` garante em compile-time
 * que o espelho não diverge do tipo canônico.
 */

const previewVariantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  props: z.record(z.string(), z.unknown()),
});

const controlBase = {
  propName: z.string().min(1),
  label: z.string().optional(),
};

const previewControlSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), ...controlBase, defaultValue: z.string().optional() }),
  z.object({ kind: z.literal('boolean'), ...controlBase, defaultValue: z.boolean().optional() }),
  z.object({
    kind: z.literal('select'),
    ...controlBase,
    options: z.array(z.string()).min(1),
    defaultValue: z.string().optional(),
  }),
]);

export const previewConfigSchema: z.ZodType<PreviewConfig> = z.object({
  component: z.string().min(1),
  variants: z.array(previewVariantSchema).min(1),
  controls: z.array(previewControlSchema),
});
