import type { PreviewConfig } from '@systembook/schema';

export function Preview(props: Record<string, unknown>) {
  return <div data-elevated={Boolean(props.elevated)}>{String(props.title ?? '')}</div>;
}

export default {
  component: 'Card',
  variants: [{ id: 'default', label: 'Default', props: { title: 'Título do card' } }],
  controls: [{ kind: 'boolean', propName: 'elevated' }],
} satisfies PreviewConfig;
