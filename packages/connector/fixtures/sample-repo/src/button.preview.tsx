import type { PreviewConfig } from '@systembook/schema';

export function Preview(props: Record<string, unknown>) {
  return <button disabled={Boolean(props.disabled)}>{String(props.children ?? 'Salvar')}</button>;
}

export default {
  component: 'Button',
  variants: [
    { id: 'primary', label: 'Primary', props: { variant: 'primary', children: 'Salvar' } },
    { id: 'disabled', label: 'Disabled', props: { variant: 'primary', disabled: true } },
  ],
  controls: [
    { kind: 'text', propName: 'children', label: 'Texto' },
    { kind: 'boolean', propName: 'disabled' },
    { kind: 'select', propName: 'variant', options: ['primary', 'secondary'] },
  ],
} satisfies PreviewConfig;
