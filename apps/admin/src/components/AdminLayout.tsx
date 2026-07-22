import { useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { queryClient, useTRPC } from '../lib/trpc.js';
import { SidebarTree } from '../features/navigation/SidebarTree.js';
import { AppHeader, useActiveMenu } from '../features/navigation/AppHeader.js';

/** Contexto passado aos filhos via Outlet (auth + menu ativo/seletor). */
export interface AdminOutletContext {
  me: { userId: string; role: 'admin' | 'editor' };
  activeMenuId: string | null;
  setActiveMenuId: (menuId: string) => void;
}

/**
 * Layout protegido: resolve auth.me; não autenticado → /login.
 *
 * TASK-85: a nav plana antiga (Início/Histórico/Página inicial/Usuários/
 * Tokens) foi substituída por um header fixo — nav central por Menu
 * (`AppHeader`), e os links administrativos relocados para o menu de
 * usuário. O corpo (sidebar + conteúdo) ganha `pt-16` para não ficar sob o
 * header fixo.
 */
export function AdminLayout() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const me = useQuery(trpc.auth.me.queryOptions());
  const { activeMenuId, setActiveMenuId } = useActiveMenu();

  // Mantém o menu ativo consistente com a página aberta (TASK-86): ao navegar
  // direto para `/pages/:pageId` (URL/busca/breadcrumb) de outro menu, troca o
  // menu ativo para o dono da página — a sidebar nunca mostra uma página cuja
  // seção não está na árvore visível. Só sincroniza na *troca de página* (ref),
  // para não desfazer uma seleção manual de menu feita no header.
  const pageMatch = useMatch('/pages/:pageId/*');
  const openPageId = pageMatch?.params.pageId;
  const menuOf = useQuery({
    ...trpc.pages.menuOf.queryOptions({ pageId: openPageId ?? '' }),
    enabled: openPageId != null,
  });
  const lastSyncedPage = useRef<string | null>(null);
  useEffect(() => {
    if (openPageId && menuOf.data && lastSyncedPage.current !== openPageId) {
      lastSyncedPage.current = openPageId;
      if (menuOf.data.menuId !== activeMenuId) setActiveMenuId(menuOf.data.menuId);
    }
  }, [openPageId, menuOf.data, activeMenuId, setActiveMenuId]);

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
    <div className="sb-admin min-h-screen">
      <AppHeader
        role={me.data.role}
        activeMenuId={activeMenuId}
        onSelectMenu={setActiveMenuId}
        onLogout={() => logout.mutate()}
        logoutPending={logout.isPending}
      />
      {/* Shell largo: sidebar fixa + área principal centralizada (~1200px) com
          bastante respiro (TASK-87, plano `# Área principal`). A sidebar é
          sticky para a estrutura ficar sempre à mão enquanto o conteúdo rola. */}
      <div className="mx-auto flex max-w-[1440px] items-start gap-8 px-6 pb-16 pt-24">
        <aside className="sticky top-24 max-h-[calc(100vh-7rem)] w-[280px] shrink-0 overflow-y-auto border-r pr-4">
          <SidebarTree activeMenuId={activeMenuId} />
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1200px]">
            <Outlet
              context={
                { me: me.data, activeMenuId, setActiveMenuId } satisfies AdminOutletContext
              }
            />
          </div>
        </main>
      </div>
    </div>
  );
}
