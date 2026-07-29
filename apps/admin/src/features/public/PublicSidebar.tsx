import { NavLink } from 'react-router-dom';
import type { RouterOutput } from '../../lib/trpc.js';

/** Árvore de navegação vinda de `sections.listPublic` — menus → seções → páginas. */
export type PublicNavTree = RouterOutput['sections']['listPublic'];

/** Uma seção da árvore, já com o slug do menu dono anexado para montar a URL. */
type NavSection = PublicNavTree[number]['sections'][number] & { menuSlug: string };

/**
 * Achata a árvore para a lista de seções que a sidebar renderiza hoje.
 *
 * A partir da SYS-37 a árvore vem agrupada por menu, mas a sidebar continua
 * mostrando as seções de **todos** os menus — escopá-la ao menu ativo é a 6.3
 * (SYS-38), junto com a top navigation que faz essa escolha. Achatar aqui
 * mantém o comportamento atual sem esconder conteúdo no meio do caminho.
 */
function flattenSections(tree: PublicNavTree): NavSection[] {
  return tree.flatMap((menu) => menu.sections.map((section) => ({ ...section, menuSlug: menu.slug })));
}

/**
 * Sidebar da doc pública (TASK-52): lista seções e suas páginas publicadas.
 * As tabs de cada página aparecem no próprio conteúdo (header da página, via
 * `PageRenderer`), não aqui. Página ativa destacada via `NavLink`.
 */
export function PublicSidebar({
  tree,
  open = false,
  onNavigate,
}: {
  tree: PublicNavTree;
  /** No mobile a sidebar é um drawer off-canvas; `open` controla o slide-in. */
  open?: boolean;
  /** Chamado ao clicar num link — o layout fecha o drawer no mobile. */
  onNavigate?: () => void;
}) {
  const navSections = flattenSections(tree);

  if (navSections.length === 0) {
    return (
      <nav
        className="sb-public-sidebar"
        data-open={open || undefined}
        aria-label="Documentation navigation"
      >
        <p className="sb-public-empty">No pages published yet.</p>
      </nav>
    );
  }

  return (
    <nav
      className="sb-public-sidebar"
      data-open={open || undefined}
      aria-label="Documentation navigation"
    >
      {navSections.map((section) => (
        <div key={section.id} className="sb-public-section">
          <h2 className="sb-public-section-title">{section.titulo}</h2>
          <ul className="sb-public-pagelist">
            {section.pages.map((page) => (
              <li key={page.id}>
                <NavLink
                  to={`/docs/${section.menuSlug}/${section.slug}/${page.slug}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `sb-public-pagelink${isActive ? ' active' : ''}`
                  }
                >
                  {page.titulo}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
