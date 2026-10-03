import type { PreviewConfig } from '@systembook/schema';
import { Button, BUTTON_VARIANTS, type ButtonVariant } from './Button';

/** O que o iframe do preview renderiza, com as props da variante e dos controles. */
export function Preview(props: Record<string, unknown>) {
  return (
    <Button variant={isVariant(props.variant) ? props.variant : 'primary'} disabled={Boolean(props.disabled)}>
      {String(props.children ?? 'Salvar')}
    </Button>
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
