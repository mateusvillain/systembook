import { useMutation, useQuery } from '@tanstack/react-query';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { queryClient, useTRPC } from '../lib/trpc.js';
import { SidebarTree } from '../features/navigation/SidebarTree.js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'text-sm font-medium transition-colors hover:text-foreground',
    isActive ? 'text-foreground' : 'text-muted-foreground',
  );

/**
 * Layout protegido: resolve auth.me; não autenticado → /login.
 * Também expõe a navegação e a ação "Sair" (TASK-16).
 */
export function AdminLayout() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const me = useQuery(trpc.auth.me.queryOptions());

  const logout = useMutation(
    trpc.auth.logout.mutationOptions({
      onSuccess: async () => {
        queryClient.clear();
        navigate('/login');
      },
    }),
  );

  if (me.isPending) {
    return <p className="p-8 text-muted-foreground">Carregando…</p>;
  }
  if (!me.data) {
    return <Navigate to="/login" replace />;
  }

  return (
    // `sb-admin`: escopo do Tailwind/shadcn (reset e tokens) — só no painel,
    // nunca na doc pública `.sb-public` (Fase 9, TASK-75).
    <div className="sb-admin mx-auto max-w-[1100px] p-4">
      <header className="mb-6 flex items-center gap-6 border-b pb-3">
        <strong className="text-base">SystemBook</strong>
        <nav className="flex flex-1 gap-4">
          <NavLink to="/" end className={navLinkClass}>
            Início
          </NavLink>
          <NavLink to="/admin/history" className={navLinkClass}>
            Histórico
          </NavLink>
          <NavLink to="/admin/settings/landing-page" className={navLinkClass}>
            Página inicial
          </NavLink>
          {me.data.role === 'admin' && (
            <NavLink to="/admin/users" className={navLinkClass}>
              Usuários
            </NavLink>
          )}
          {me.data.role === 'admin' && (
            <NavLink to="/admin/settings/tokens" className={navLinkClass}>
              Tokens
            </NavLink>
          )}
        </nav>
        <span className="text-muted-foreground text-sm">{me.data.role}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut />
          Sair
        </Button>
      </header>
      <div className="flex items-start gap-6">
        <aside className="min-h-[60vh] w-[280px] shrink-0 border-r pr-4">
          <SidebarTree />
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet context={{ me: me.data }} />
        </main>
      </div>
    </div>
  );
}
