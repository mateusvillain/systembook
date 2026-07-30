import { Link, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC, type RouterOutput } from '../../lib/trpc.js';
import { PublicMenuNav } from './PublicMenuNav.js';

/** Árvore de navegação vinda de `sections.listPublic` — menus → seções → páginas. */
export type PublicNavTree = RouterOutput['sections']['listPublic'];

/**
 * Identidade da instância no topo da sidebar (SYS-39): logo enviado no CMS ou,
 * sem logo, o nome do design system em texto. Sempre leva para `/docs` — é a
 * convenção de qualquer documentação, e a raiz não tinha nenhuma outra porta
 * depois que a marca saiu do header.
 *
 * As duas variantes são renderizadas juntas e escolhidas **por CSS**
 * (`[data-theme='dark']`), não por JS: `useTheme` guarda estado local por
 * instância, então chamá-lo aqui criaria um segundo tema, independente do
 * botão do header. A dark cai na clara quando não foi enviada.
 */
function PublicBrand({ onNavigate }: { onNavigate?: () => void }) {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getPublic.queryOptions());
  if (!data) return null;

  const { nomeDesignSystem, logoUrl, logoDarkUrl } = data;
  const darkUrl = logoDarkUrl ?? logoUrl;

  return (
    <Link to="/docs" className="sb-public-brand-link" onClick={onNavigate}>
      {logoUrl ? (
        <>
          <img className="sb-public-logo sb-public-logo-light" src={logoUrl} alt={nomeDesignSystem} />
          <img className="sb-public-logo sb-public-logo-dark" src={darkUrl!} alt={nomeDesignSystem} />
        </>
      ) : (
        <span className="sb-public-brand">{nomeDesignSystem}</span>
      )}
    </Link>
  );
}

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
        <PublicBrand onNavigate={onNavigate} />
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
      <PublicBrand onNavigate={onNavigate} />
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
