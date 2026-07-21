import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Wrapper do Sonner (TASK-76). O painel admin é light-only (a Fase 9 não
 * introduz tema escuro no admin — a doc pública tem o seu próprio, TASK-55),
 * então não dependemos de `next-themes`. Estilo alinhado aos tokens do shadcn.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
