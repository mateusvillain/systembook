import { Button } from '@/components/ui/button';

export function DashboardPage() {
  return (
    <section>
      <h1>Bem-vindo ao SystemBook</h1>
      <p>
        Use a árvore ao lado para montar a estrutura da documentação (seções → páginas → tabs). O
        editor de conteúdo chega na Fase 3.
      </p>
      {/* Smoke test do pipeline Tailwind + shadcn (TASK-75) — a migração real
          das telas vem nas TASK-77..80. */}
      <div className="mt-4 flex gap-2">
        <Button>Ação primária</Button>
        <Button variant="outline">Secundária</Button>
      </div>
    </section>
  );
}
