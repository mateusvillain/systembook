import { useMutation, useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { queryClient, useTRPC } from '../../lib/trpc.js';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Itens extra dos dropdowns de navegação (TASK-109), injetados via a prop
 * `extraItems` do `RowActionsMenu`. Vivem aqui (não no `RowActionsMenu`) porque
 * dependem de tRPC/clipboard — o `RowActionsMenu` segue puramente apresentável.
 */

/** Monta a URL pública absoluta de uma página a partir dos slugs. */
export function publicPageUrl(sectionSlug: string, pageSlug: string): string {
  return `${window.location.origin}/docs/${sectionSlug}/${pageSlug}`;
}

/**
 * "Copiar link" — copia a URL PÚBLICA (`/docs/:sectionSlug/:pageSlug`), nunca a
 * de edição do CMS. Desabilitado (com tooltip) quando o alvo não tem página
 * pública ainda — ex.: um menu sem seções/páginas. Recebe os slugs já
 * resolvidos; o clipboard é escrito no próprio gesto do clique (sem await).
 */
export function CopyLinkItem({
  sectionSlug,
  pageSlug,
  disabledReason,
}: {
  sectionSlug: string | null | undefined;
  pageSlug: string | null | undefined;
  /** Tooltip quando desabilitado (ex.: "Este menu ainda não tem páginas"). */
  disabledReason?: string;
}) {
  const disabled = !sectionSlug || !pageSlug;
  return (
    <DropdownMenuItem
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onSelect={() => {
        if (disabled) return;
        void navigator.clipboard
          .writeText(publicPageUrl(sectionSlug, pageSlug))
          .then(() => toast.success('Link copied'))
          .catch(() => toast.error('Could not copy the link'));
      }}
    >
      <Link2 className="size-4" />
      Copy link
    </DropdownMenuItem>
  );
}

/**
 * "Mover para outro menu" — submenu Menu → Seção que troca a seção da página
 * (`pages.move`). Renderiza `null` quando há menos de 2 menus (regra da
 * TASK-109). A seção atual é omitida (mover para si mesma é no-op).
 */
export function MoveToMenuSub({
  pageId,
  currentSectionId,
  onMoved,
}: {
  pageId: string;
  currentSectionId: string;
  onMoved: () => void;
}) {
  const trpc = useTRPC();
  const menusQuery = useQuery(trpc.menus.list.queryOptions());
  const move = useMutation(
    trpc.pages.move.mutationOptions({
      onSuccess: () => {
        onMoved();
        toast.success('Page moved');
      },
      onError: () => toast.error('Could not move the page'),
    }),
  );

  const menus = menusQuery.data ?? [];
  if (menus.length < 2) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Move to another menu</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {menus.map((menu) => (
          <MenuSectionsSub
            key={menu.id}
            menuId={menu.id}
            menuTitulo={menu.titulo}
            currentSectionId={currentSectionId}
            onPick={(targetSectionId) => move.mutate({ pageId, targetSectionId })}
          />
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Um menu no picker: submenu aninhado com as seções daquele menu. */
function MenuSectionsSub({
  menuId,
  menuTitulo,
  currentSectionId,
  onPick,
}: {
  menuId: string;
  menuTitulo: string;
  currentSectionId: string;
  onPick: (sectionId: string) => void;
}) {
  const trpc = useTRPC();
  const sectionsQuery = useQuery(trpc.sections.listByMenu.queryOptions({ menuId }));
  // Omite a seção onde a página já está — mover para ela é no-op.
  const sections = (sectionsQuery.data ?? []).filter((s) => s.id !== currentSectionId);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{menuTitulo}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {sectionsQuery.isPending && (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        )}
        {!sectionsQuery.isPending && sections.length === 0 && (
          <DropdownMenuItem disabled>No other section</DropdownMenuItem>
        )}
        {sections.map((section) => (
          <DropdownMenuItem key={section.id} onSelect={() => onPick(section.id)}>
            {section.titulo}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * Invalida o que um move afeta: as listas de páginas (origem + destino) e o
 * `firstPagePath` dos menus — o "Copiar link" de um menu depende da 1ª página,
 * que pode ter mudado com o move (senão o menu copiaria um path obsoleto).
 */
export function invalidateNavAfterMove(trpc: ReturnType<typeof useTRPC>) {
  void queryClient.invalidateQueries(trpc.pages.listBySection.queryFilter());
  void queryClient.invalidateQueries(trpc.menus.firstPagePath.queryFilter());
}
