import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface MenuRow {
  id: string;
  titulo: string;
}

/**
 * Header fixo (TASK-85): navegação pura entre grandes áreas.
 *
 * Nunca hospeda ações de edição de conteúdo — a única exceção deliberada é a
 * gestão da própria entidade Menu (criar/renomear/reordenar/excluir), já que
 * menus são estrutura de navegação top-level, não conteúdo.
 */
export function AppHeader({
  role,
  activeMenuId,
  onSelectMenu,
  onLogout,
  logoutPending,
}: {
  role: string;
  activeMenuId: string | null;
  onSelectMenu: (menuId: string) => void;
  onLogout: () => void;
  logoutPending: boolean;
}) {
  return (
    <header className="bg-background fixed inset-x-0 top-0 z-40 h-16 border-b">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-6 px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-editorial-sm text-sm font-bold">
            S
          </span>
          <strong className="text-foreground text-base">SystemBook</strong>
        </Link>

        <MenuNav activeMenuId={activeMenuId} onSelectMenu={onSelectMenu} />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Busca (em breve)"
            title="Busca (em breve)"
            aria-disabled="true"
            className="text-muted-foreground inline-flex size-8 items-center justify-center rounded-editorial-sm opacity-50"
          >
            <Search className="size-4" />
          </button>
          <UserMenu role={role} onLogout={onLogout} logoutPending={logoutPending} />
        </div>
      </div>
    </header>
  );
}

/** Navegação central: um item por menu (`menus.list`), item ativo escopa a sidebar (TASK-86). */
function MenuNav({
  activeMenuId,
  onSelectMenu,
}: {
  activeMenuId: string | null;
  onSelectMenu: (menuId: string) => void;
}) {
  const trpc = useTRPC();
  const menusQuery = useQuery(trpc.menus.list.queryOptions());
  const invalidate = () => queryClient.invalidateQueries(trpc.menus.list.queryFilter());

  const create = useMutation(trpc.menus.create.mutationOptions({ onSuccess: invalidate }));
  const rename = useMutation(trpc.menus.rename.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(trpc.menus.delete.mutationOptions({ onSuccess: invalidate }));
  const reorder = useMutation(trpc.menus.reorder.mutationOptions({ onSuccess: invalidate }));

  const menuList = menusQuery.data ?? [];

  function move(index: number, delta: -1 | 1) {
    const ids = menuList.map((m) => m.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    reorder.mutate({ orderedIds: ids });
  }

  return (
    <nav aria-label="Menus" className="flex min-w-0 flex-1 items-center gap-1">
      {menuList.map((menu, i) => (
        <MenuNavItem
          key={menu.id}
          menu={menu}
          active={menu.id === activeMenuId}
          onSelect={() => onSelectMenu(menu.id)}
          onRename={(titulo) => rename.mutate({ id: menu.id, titulo })}
          onDelete={() => {
            if (
              window.confirm(
                `Excluir o menu "${menu.titulo}"? Todas as seções, páginas e tabs dentro dele também serão removidas.`,
              )
            ) {
              remove.mutate({ id: menu.id });
            }
          }}
          onMoveUp={i > 0 ? () => move(i, -1) : undefined}
          onMoveDown={i < menuList.length - 1 ? () => move(i, 1) : undefined}
        />
      ))}
      <AddMenu onCreate={(titulo) => create.mutateAsync({ titulo })} />
    </nav>
  );
}

function MenuNavItem({
  menu,
  active,
  onSelect,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  menu: MenuRow;
  active: boolean;
  onSelect: () => void;
  onRename: (titulo: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(menu.titulo);

  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onRename(draft.trim());
          setEditing(false);
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Novo título do menu ${menu.titulo}`}
          className="border-input min-w-0 rounded-editorial-sm border bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        />
        <button type="submit" aria-label="Salvar" className="text-muted-foreground hover:text-foreground p-1">
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Cancelar"
          className="text-muted-foreground hover:text-foreground p-1"
          onClick={() => setEditing(false)}
        >
          <X className="size-3.5" />
        </button>
      </form>
    );
  }

  return (
    <div className="group flex shrink-0 items-center">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'rounded-editorial-sm px-2.5 py-1.5 text-sm font-medium transition-colors',
          active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        )}
      >
        {menu.titulo}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Mais ações do menu ${menu.titulo}`}
            className="text-muted-foreground hover:text-foreground -ml-1 inline-flex size-6 items-center justify-center rounded-editorial-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onSelect={() => {
              setDraft(menu.titulo);
              setEditing(true);
            }}
          >
            Renomear
          </DropdownMenuItem>
          {onMoveUp && <DropdownMenuItem onSelect={onMoveUp}>Mover para cima</DropdownMenuItem>}
          {onMoveDown && <DropdownMenuItem onSelect={onMoveDown}>Mover para baixo</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** "+ Add" da navegação central — cria um novo menu (`menus.create`, TASK-84). */
function AddMenu({ onCreate }: { onCreate: (titulo: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!titulo.trim()) return;
    await onCreate(titulo.trim());
    setTitulo('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Adicionar menu"
        title="Adicionar menu"
        className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex shrink-0 items-center justify-center rounded-editorial-sm p-1.5"
      >
        <Plus className="size-4" />
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex shrink-0 items-center gap-1">
      <input
        autoFocus
        placeholder="Nome do menu"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label="Nome do novo menu"
        className="border-input w-32 min-w-0 rounded-editorial-sm border bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      />
      <button type="submit" aria-label="Criar menu" className="text-muted-foreground hover:text-foreground p-1">
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Cancelar"
        className="text-muted-foreground hover:text-foreground p-1"
        onClick={() => setOpen(false)}
      >
        <X className="size-3.5" />
      </button>
    </form>
  );
}

/**
 * Configurações + usuário (direita): concentra tudo que antes era nav plana
 * no `AdminLayout` (Usuários/Tokens/Histórico/Página inicial/Sair). O ícone
 * de engrenagem e o chip do usuário abrem o mesmo menu — dois pontos de
 * entrada para a mesma superfície, como no plano (`busca · configurações ·
 * usuário`).
 */
function UserMenu({
  role,
  onLogout,
  logoutPending,
}: {
  role: string;
  onLogout: () => void;
  logoutPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isAdmin = role === 'admin';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label="Configurações"
        title="Configurações"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-8 items-center justify-center rounded-editorial-sm"
      >
        <Settings className="size-4" />
      </button>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-accent flex items-center gap-2 rounded-editorial-sm py-1 pl-1 pr-2"
          aria-label="Menu do usuário"
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold uppercase">
              {role.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground text-sm">{role}</span>
          <ChevronDown className="text-muted-foreground size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link to="/admin/history">Histórico global</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/settings/landing-page">Página inicial</Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin/users">Usuários</Link>
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin/settings/tokens">Tokens</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={logoutPending} onSelect={onLogout}>
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Deriva/mantém o menu ativo (TASK-85's escolha: estado elevado no
 * `AdminLayout`, não a URL — evita adicionar segmentos a `/pages/:pageId`
 * enquanto a sidebar (TASK-86) ainda não é escopada por menu). Assim que a
 * TASK-86 escopar a sidebar, este hook passa a ser a fonte única da verdade
 * consumida por `sections.listByMenu`.
 */
export function useActiveMenu() {
  const trpc = useTRPC();
  const menusQuery = useQuery(trpc.menus.list.queryOptions());
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeMenuId && menusQuery.data && menusQuery.data.length > 0) {
      setActiveMenuId(menusQuery.data[0]!.id);
    }
  }, [activeMenuId, menusQuery.data]);

  return { activeMenuId, setActiveMenuId };
}
