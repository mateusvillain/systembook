import type { ButtonHTMLAttributes, CSSProperties } from 'react';

export const BUTTON_VARIANTS = ['primary', 'secondary', 'danger'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Cores pelos design tokens (`tokens/`): no preview da doc as variáveis
 * `--acme-*` chegam com o modo escolhido no seletor, e o botão acompanha. O
 * segundo valor do `var()` é o do modo claro, para o componente fora da doc.
 */
const palette: Record<ButtonVariant, { background: string; color: string; border: string }> = {
  primary: {
    background: 'var(--acme-primary, #4f46e5)',
    color: 'var(--acme-on-primary, #ffffff)',
    border: 'var(--acme-primary, #4f46e5)',
  },
  secondary: {
    background: 'var(--acme-surface, #f8fafc)',
    color: 'var(--acme-primary, #4f46e5)',
    border: 'var(--acme-neutral, #475569)',
  },
  danger: {
    background: 'var(--acme-danger, #dc2626)',
    color: 'var(--acme-on-danger, #ffffff)',
    border: 'var(--acme-danger, #dc2626)',
  },
};

/** O botão do Acme DS: estilos inline para o exemplo não depender de CSS. */
export function Button({ variant = 'primary', disabled, style, ...props }: ButtonProps) {
  const colors = palette[variant];
  const base: CSSProperties = {
    ...colors,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: '8px 16px',
    font: '600 14px/20px system-ui, sans-serif',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
  return <button type="button" disabled={disabled} style={{ ...base, ...style }} {...props} />;
}
