import type { ButtonHTMLAttributes, CSSProperties } from 'react';

export const BUTTON_VARIANTS = ['primary', 'secondary', 'danger'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const palette: Record<ButtonVariant, { background: string; color: string; border: string }> = {
  primary: { background: '#4f46e5', color: '#ffffff', border: '#4f46e5' },
  secondary: { background: '#ffffff', color: '#312e81', border: '#c7d2fe' },
  danger: { background: '#dc2626', color: '#ffffff', border: '#dc2626' },
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
