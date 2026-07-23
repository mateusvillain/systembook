import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { queryClient, useTRPC } from '../lib/trpc.js';
import { SidebarTree } from '../features/navigation/SidebarTree.js';
import { AppHeader, useActiveMenu } from '../features/navigation/AppHeader.js';
import { cn } from '@/lib/utils';

/** Abaixo deste ponto (px) a sidebar é drawer; acima, coluna recolhível/fixa. */
const MOBILE_BREAKPOINT = 768;

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

  // Estado único da sidebar responsiva (TASK-92): no tablet significa "coluna
  // expandida" (recolhível, em fluxo); no mobile, "drawer aberto" (overlay). No
  // desktop a coluna é sempre visível via CSS (`lg:block`), então o estado só
  // afeta tablet/mobile. Default = expandida a partir do tablet, recolhida no
  // mobile — assim o drawer não nasce aberto num celular.
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= MOBILE_BREAKPOINT,
  );
  // Ao selecionar uma página, só o drawer (mobile) fecha; no tablet a coluna
  // recolhível permanece como o usuário a deixou.
  const closeDrawerOnNavigate = () => {
    if (window.innerWidth < MOBILE_BREAKPOINT) setSidebarOpen(false);
  };

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
    <div className="sb-admin min-h-screen overflow-x-hidden">
      <AppHeader
        role={me.data.role}
        activeMenuId={activeMenuId}
        onSelectMenu={setActiveMenuId}
        onLogout={() => logout.mutate()}
        logoutPending={logout.isPending}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
      />
      {/* Shell largo: sidebar + área principal centralizada (~1200px) com bastante
          respiro (TASK-87). Responsividade (TASK-92): desktop = coluna fixa;
          tablet = coluna recolhível (em fluxo); mobile = drawer off-canvas. */}
      <div className="mx-auto flex max-w-[1440px] items-start gap-0 px-4 pb-16 pt-20 md:gap-8 md:px-6 md:pt-24">
        {/* Backdrop só no mobile, com o drawer aberto: fecha ao tocar fora. */}
        {sidebarOpen && (
          <div
            className="bg-foreground/30 fixed inset-0 z-40 md:hidden"
            aria-hidden
            onClick={() => setSidebarOpen(false)}
            data-testid="admin-nav-backdrop"
          />
        )}
        <aside
          id="admin-sidebar"
          className={cn(
            // Mobile: drawer fixo que desliza da esquerda.
            'bg-background fixed inset-y-0 left-0 z-50 w-[280px] max-w-[82vw] overflow-y-auto border-r px-4 py-6 transition-transform duration-200',
            // Tablet/desktop: coluna sticky em fluxo (sem overlay/sombra).
            'md:sticky md:top-24 md:z-auto md:max-h-[calc(100vh-7rem)] md:max-w-none md:translate-x-0 md:py-0 md:pl-0 md:pr-4 md:shadow-none md:transition-none',
            sidebarOpen
              ? 'translate-x-0 shadow-lg md:block'
              : '-translate-x-full md:hidden lg:block',
          )}
        >
          {/* Mobile: a nav de menus (escondida no header estreito) mora aqui. */}
          <MobileMenuSwitcher activeMenuId={activeMenuId} onSelect={setActiveMenuId} />
          <SidebarTree activeMenuId={activeMenuId} onNavigate={closeDrawerOnNavigate} />
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

/**
 * Troca de menu ativo dentro do drawer mobile (TASK-92). No header estreito a
 * `MenuNav` central some (evita overflow), então o mobile precisa de um lugar
 * para alternar os menus top-level — este chip-row no topo do drawer. É só
 * troca: o CRUD de menus (criar/renomear/reordenar) segue na `MenuNav` do
 * header, do tablet para cima (gap conhecido, aceito no MVP mobile).
 */
function MobileMenuSwitcher({
  activeMenuId,
  onSelect,
}: {
  activeMenuId: string | null;
  onSelect: (menuId: string) => void;
}) {
  const trpc = useTRPC();
  const menus = useQuery(trpc.menus.list.queryOptions()).data ?? [];
  // Com um único menu não há o que alternar — nada a mostrar.
  if (menus.length <= 1) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b pb-4 md:hidden" aria-label="Menus">
      {menus.map((menu) => (
        <button
          key={menu.id}
          type="button"
          onClick={() => onSelect(menu.id)}
          aria-current={menu.id === activeMenuId ? 'true' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center rounded-editorial-sm px-3 text-sm transition-colors',
            menu.id === activeMenuId
              ? 'bg-accent text-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {menu.titulo}
        </button>
      ))}
    </div>
  );
}
