import { NavLink, useLocation } from 'react-router-dom';
import type { PublicNavTree } from './PublicSidebar.js';

type PublicMenu = PublicNavTree[number];

/**
 * Destino de um menu: sua primeira página publicada. Menus não têm página
 * própria (TASK-109) — clicar num deles leva ao primeiro conteúdo abaixo dele.
 * A árvore de `sections.listPublic` já vem ordenada e sem menus/seções vazios
 * (SYS-37), então o primeiro de cada nível é o certo; o fallback para `/docs`
 * é defensivo e não deve acontecer na prática.
 */
export function menuLandingPath(menu: PublicMenu): string {
  const section = menu.sections[0];
  const page = section?.pages[0];
  return section && page ? `/docs/${menu.slug}/${section.slug}/${page.slug}` : '/docs';
}

/**
 * Menu ativo derivado da URL, casando o primeiro segmento de `/docs/…` com os
 * slugs conhecidos. Casar contra a árvore (em vez de assumir que o 1º segmento
 * é sempre um menu) é o que mantém isto correto durante o instante em que uma
 * URL legada de 2 segmentos ainda não foi redirecionada (SYS-37): ali o
 * primeiro segmento é uma *seção*, não casa com nenhum menu, e nenhum pill
 * pisca como ativo por engano.
 *
 * Em `/docs` (a landing) não há menu na URL — e por isso nenhum pill fica
 * ativo. A landing é um destino próprio, não uma janela para dentro de um
 * menu; marcar um pill ali afirmaria uma localização onde o leitor não está.
 */
export function useActiveMenu(tree: PublicNavTree): PublicMenu | undefined {
  const { pathname } = useLocation();
  const [first] = pathname.replace(/^\/docs\/?/, '').split('/').filter(Boolean);
  return tree.find((menu) => menu.slug === first);
}

/**
 * Troca entre os menus da documentação (SYS-38). Renderizada duas vezes — no
 * header (desktop) e no topo do drawer (mobile) — com a cópia fora de uso
 * removida por `display: none` em `public.css`, o que a tira também da árvore
 * de acessibilidade.
 *
 * Some quando há um único menu: instâncias que nunca criaram menus caem no
 * `DEFAULT_MENU_ID`, e uma barra com um só item não oferece escolha nenhuma.
 */
export function PublicMenuNav({
  tree,
  className,
  onNavigate,
}: {
  tree: PublicNavTree;
  className: string;
  /** Chamado ao trocar de menu — o layout fecha o drawer no mobile. */
  onNavigate?: () => void;
}) {
  const activeMenu = useActiveMenu(tree);

  if (tree.length < 2) return null;

  return (
    <nav className={`sb-public-menunav ${className}`} aria-label="Documentation menus">
      {tree.map((menu) => {
        const active = menu.slug === activeMenu?.slug;
        return (
          <NavLink
            key={menu.id}
            to={menuLandingPath(menu)}
            onClick={onNavigate}
            className="sb-public-menupill"
            // `true`, não `page`: o leitor está *dentro* deste menu, mas
            // quase nunca na página exata para onde o pill aponta.
            aria-current={active ? true : undefined}
            data-active={active || undefined}
          >
            {menu.titulo}
          </NavLink>
        );
      })}
    </nav>
  );
}
