import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { queryClient, useTRPC } from '../lib/trpc.js';
import { SidebarTree } from '../features/navigation/SidebarTree.js';

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
    return <p style={{ padding: '2rem', fontFamily: 'system-ui' }}>Carregando…</p>;
  }
  if (!me.data) {
    return <Navigate to="/login" replace />;
  }

  return (
    // `sb-admin`: escopo do Tailwind/shadcn (reset e tokens) — só no painel,
    // nunca na doc pública `.sb-public` (Fase 9, TASK-75).
    <div
      className="sb-admin"
      style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '0 auto', padding: '1rem' }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          borderBottom: '1px solid #ddd',
          paddingBottom: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <strong>SystemBook</strong>
        <nav style={{ display: 'flex', gap: '1rem', flex: 1 }}>
          <Link to="/">Início</Link>
          <Link to="/admin/history">Histórico</Link>
          <Link to="/admin/settings/landing-page">Página inicial</Link>
          {me.data.role === 'admin' && <Link to="/admin/users">Usuários</Link>}
          {me.data.role === 'admin' && <Link to="/admin/settings/tokens">Tokens</Link>}
        </nav>
        <span style={{ color: '#666', fontSize: '0.9rem' }}>{me.data.role}</span>
        <button onClick={() => logout.mutate()} disabled={logout.isPending}>
          Sair
        </button>
      </header>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid #eee',
            paddingRight: '1rem',
            minHeight: '60vh',
          }}
        >
          <SidebarTree />
        </aside>
        <main style={{ flex: 1, minWidth: 0 }}>
          <Outlet context={{ me: me.data }} />
        </main>
      </div>
    </div>
  );
}
