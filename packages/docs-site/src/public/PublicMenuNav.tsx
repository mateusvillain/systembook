import { NavLink, useLocation } from 'react-router-dom';
import type { PublicNavTree } from '@systembook/schema';
import { TOKENS_SEGMENT } from '@systembook/content/site';
import { useTokens } from '../content/docsQueries.js';
import { useDocsPaths, type DocsPaths } from './docsRoutes.js';

type PublicMenu = PublicNavTree[number];

/**
 * Destino de um menu: sua primeira página publicada. Menus não têm página
 * própria (TASK-109) — clicar num deles leva ao primeiro conteúdo abaixo dele.
 * A árvore de `DocsDataSource.getNavTree` já vem ordenada e sem menus/seções vazios
 * (SYS-37), então o primeiro de cada nível é o certo; o fallback para a raiz
 * da doc é defensivo e não deve acontecer na prática.
 */
export function menuLandingPath(menu: PublicMenu, paths: DocsPaths): string {
  const section = menu.sections[0];
  const page = section?.pages[0];
  return section && page
    ? paths.page({ menuSlug: menu.slug, sectionSlug: section.slug, pageSlug: page.slug })
    : paths.home;
}

/**
 * Menu ativo derivado da URL, casando o primeiro segmento abaixo da raiz da doc com os
 * slugs conhecidos. Casar contra a árvore (em vez de assumir que o 1º segmento
 * é sempre um menu) é o que mantém isto correto durante o instante em que uma
 * URL legada de 2 segmentos ainda não foi redirecionada (SYS-37): ali o
 * primeiro segmento é uma *seção*, não casa com nenhum menu, e nenhum pill
 * pisca como ativo por engano.
 *
 * Na raiz da doc (a landing) não há menu na URL — e por isso nenhum pill fica
 * ativo. A landing é um destino próprio, não uma janela para dentro de um
 * menu; marcar um pill ali afirmaria uma localização onde o leitor não está.
 */
export function useActiveMenu(tree: PublicNavTree): PublicMenu | undefined {
  const { pathname } = useLocation();
  const [first] = useDocsPaths().segments(pathname);
  const onTokens = useOnTokensPage();
  // A página Tokens (SYS-140) não é menu, mesmo que um menu se chame `tokens`.
  if (onTokens) return undefined;
  return tree.find((menu) => menu.slug === first);
}

/** A URL é a página Tokens gerada (SYS-140): um segmento só, `tokens`. */
export function useOnTokensPage(): boolean {
  const { pathname } = useLocation();
  const segments = useDocsPaths().segments(pathname);
  return segments.length === 1 && segments[0] === TOKENS_SEGMENT;
}

/**
 * Troca entre os menus da documentação (SYS-38). Renderizada duas vezes — no
 * header (desktop) e no topo do drawer (mobile) — com a cópia fora de uso
 * removida por `display: none` em `public.css`, o que a tira também da árvore
 * de acessibilidade.
 *
 * Some quando há um único menu: instâncias que nunca criaram menus caem no
 * `DEFAULT_MENU_ID`, e uma barra com um só item não oferece escolha nenhuma.
 * Com design tokens, a página Tokens gerada (SYS-140) entra no fim da barra —
 * e aí a barra sempre aparece: um menu só (ou nenhum) já é uma escolha.
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
  const paths = useDocsPaths();
  // A mesma query da página e dos blocos (cacheada): o link só existe com tokens.
  const hasTokens = !!useTokens().data;
  const onTokens = useOnTokensPage();

  // Com tokens, a barra aparece até sem menu nenhum: é o único caminho para a página.
  if (!hasTokens && tree.length < 2) return null;

  return (
    <nav className={`sb-public-menunav ${className}`} aria-label="Documentation menus">
      {tree.map((menu) => {
        const active = menu.slug === activeMenu?.slug;
        return (
          <NavLink
            key={menu.id}
            to={menuLandingPath(menu, paths)}
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
      {hasTokens && (
        <NavLink
          to={paths.tokens}
          onClick={onNavigate}
          className="sb-public-menupill"
          aria-current={onTokens ? 'page' : undefined}
          data-active={onTokens || undefined}
        >
          Tokens
        </NavLink>
      )}
    </nav>
  );
}
