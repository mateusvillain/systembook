import { NavLink } from 'react-router-dom';
import type { RouterOutput } from '../../lib/trpc.js';

/** Árvore de navegação vinda de `sections.listPublic`. */
export type PublicNavTree = RouterOutput['sections']['listPublic'];

/**
 * Sidebar da doc pública (TASK-52): lista seções e suas páginas publicadas.
 * As tabs de cada página aparecem no próprio conteúdo (header da página, via
 * `PageRenderer`), não aqui. Página ativa destacada via `NavLink`.
 */
export function PublicSidebar({ tree }: { tree: PublicNavTree }) {
  if (tree.length === 0) {
    return (
      <nav className="sb-public-sidebar" aria-label="Navegação da documentação">
        <p className="sb-public-empty">Nenhuma página publicada ainda.</p>
      </nav>
    );
  }

  return (
    <nav className="sb-public-sidebar" aria-label="Navegação da documentação">
      {tree.map((section) => (
        <div key={section.id} className="sb-public-section">
          <h2 className="sb-public-section-title">{section.titulo}</h2>
          <ul className="sb-public-pagelist">
            {section.pages.map((page) => (
              <li key={page.id}>
                <NavLink
                  to={`/docs/${section.slug}/${page.slug}`}
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
