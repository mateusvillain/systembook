import { ActivityFeed } from '../features/revisions/ActivityFeed.js';
import { adminTypography } from '@/lib/typography';

/**
 * Tela de atividade do painel (SYS-70): a visão de "o que mudou recentemente
 * no design system", alimentada pelas revisões de todas as páginas (TASK-69,
 * SYS-69). Rota `/admin/history`, acessível pelo menu de usuário do header.
 *
 * A tela é só o cabeçalho — o feed em si é `ActivityFeed`, ao lado das outras
 * superfícies de revisão em `features/revisions/`.
 */
export function GlobalHistoryPage() {
  return (
    <section className="grid gap-6">
      <div className="grid gap-1">
        <h1 className={adminTypography.title}>Activity</h1>
        <p className={adminTypography.description}>
          Recent publishes and restores across every page.
        </p>
      </div>
      <ActivityFeed />
    </section>
  );
}
