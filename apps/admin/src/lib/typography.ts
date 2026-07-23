/**
 * Papéis tipográficos do painel (Fase 10, TASK-82).
 *
 * Use estas constantes ao compor as superfícies editoriais da Fase 10, em vez
 * de reconstituir tamanhos/pesos em cada página. Os valores `text-admin-*`
 * são declarados no `index.css`, mantendo tipografia e tokens no mesmo tema.
 */
export const adminTypography = {
  category: 'text-admin-eyebrow font-medium uppercase tracking-[0.12em] text-muted-foreground',
  title: 'text-admin-title font-bold tracking-[-0.035em] text-foreground',
  description: 'text-admin-description font-light tracking-[-0.015em] text-muted-foreground',
  metadata: 'text-admin-metadata text-muted-foreground',
  body: 'text-admin-body text-foreground',
} as const;
