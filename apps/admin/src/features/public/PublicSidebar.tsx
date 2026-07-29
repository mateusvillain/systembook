import { NavLink } from 'react-router-dom';
import type { RouterOutput } from '../../lib/trpc.js';
import { PublicMenuNav } from './PublicMenuNav.js';

/** Árvore de navegação vinda de `sections.listPublic` — menus → seções → páginas. */
export type PublicNavTree = RouterOutput['sections']['listPublic'];

/**
 * Sidebar da doc pública (TASK-52): lista as seções do **menu ativo** (SYS-38)
 * e suas páginas publicadas. As tabs de cada página aparecem no próprio
 * conteúdo (header da página, via `PageRenderer`), não aqui. Página ativa
 * destacada via `NavLink`.
 */
export function PublicSidebar({
  tree,
  menu,
  open = false,
  onNavigate,
}: {
  tree: PublicNavTree;
  /**
   * Menu cujas seções a sidebar lista. `undefined` só enquanto a árvore
   * carrega — o layout resolve o fallback, não este componente.
   */
  menu: PublicNavTree[number] | undefined;
  /** No mobile a sidebar é um drawer off-canvas; `open` controla o slide-in. */
  open?: boolean;
  /** Chamado ao clicar num link — o layout fecha o drawer no mobile. */
  onNavigate?: () => void;
}) {
  const sections = menu?.sections ?? [];

  if (sections.length === 0) {
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
      {/* Só aparece no mobile (o header some nessa largura): sem isto o drawer
          seria a única navegação visível e não haveria como trocar de menu. */}
      <PublicMenuNav
        tree={tree}
        className="sb-public-menunav-drawer"
        onNavigate={onNavigate}
      />
      {sections.map((section) => (
        <div key={section.id} className="sb-public-section">
          <h2 className="sb-public-section-title">{section.titulo}</h2>
          <ul className="sb-public-pagelist">
            {section.pages.map((page) => (
              <li key={page.id}>
                <NavLink
                  to={`/docs/${menu!.slug}/${section.slug}/${page.slug}`}
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
