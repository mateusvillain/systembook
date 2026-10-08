import type { CSSProperties } from 'react';

/**
 * Amostra visual de um valor (swatch, barra, cartão): um `span` decorativo — o
 * valor vem escrito ao lado — que recebe o CSS do token numa variável. A
 * variável (em vez de `style.background` etc.) deixa cada regra no
 * `content.css` decidir onde aplicar, sem estilo inline concorrendo com o tema.
 */
export function TokenSample({ kind, value }: { kind: 'color' | 'size' | 'radius' | 'border-width' | 'border' | 'stroke' | 'gradient' | 'shadow' | 'opacity' | 'square' | 'blur' | 'aspect-ratio'; value: string }) {
  return <span className={`sb-token-${kind}`} aria-hidden style={{ [`--sb-token-${kind}`]: value } as CSSProperties} />;
}
