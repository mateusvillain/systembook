import type { PreviewConfig } from '@systembook/schema';
import { Button, BUTTON_VARIANTS, type ButtonVariant } from './Button';

/**
 * O que o iframe do preview renderiza, com as props da variante e dos
 * controles. O fundo é a superfície do modo escolhido na doc (`--acme-surface`),
 * para o botão aparecer sobre a cor em que ele é usado.
 */
export function Preview(props: Record<string, unknown>) {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'auto', padding: 16, background: 'var(--acme-surface, #f8fafc)' }}>
      <Button variant={isVariant(props.variant) ? props.variant : 'primary'} disabled={Boolean(props.disabled)}>
        {String(props.children ?? 'Salvar')}
      </Button>
    </div>
  );
}

function isVariant(value: unknown): value is ButtonVariant {
  return BUTTON_VARIANTS.includes(value as ButtonVariant);
}

export default {
  component: 'Button',
  variants: [
    { id: 'primary', label: 'Primary', props: { variant: 'primary', children: 'Salvar alterações' } },
    { id: 'secondary', label: 'Secondary', props: { variant: 'secondary', children: 'Cancelar' } },
    { id: 'danger', label: 'Danger', props: { variant: 'danger', children: 'Excluir projeto' } },
    { id: 'disabled', label: 'Disabled', props: { variant: 'primary', children: 'Salvar', disabled: true } },
  ],
  controls: [
    { kind: 'text', propName: 'children', label: 'Rótulo' },
    { kind: 'select', propName: 'variant', label: 'Variante', options: [...BUTTON_VARIANTS] },
    { kind: 'boolean', propName: 'disabled', label: 'Desabilitado' },
  ],
} satisfies PreviewConfig;
