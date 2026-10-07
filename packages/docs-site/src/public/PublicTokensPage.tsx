import { useRef } from 'react';
import { tokenSections } from '@systembook/content/tokens';
import { useTokens } from '../content/docsQueries.js';
import { TokenGroup } from '../content/tokens/TokenGroup.js';
import { DocsNotFound } from './DocsNotFound.js';
import { TableOfContents } from './TableOfContents.js';
import { useHashScroll } from './useHashScroll.js';
import { useHeadingIds } from './useHeadingIds.js';

/**
 * Página Tokens gerada (SYS-140): todos os design tokens, uma seção por grupo
 * (`tokenSections`) e, dentro dela, uma tabela por renderer (`TokenGroup`, o
 * mesmo do bloco `token-table`). Para quem não quer montar a página à mão.
 * Sem tokens a rota não existe — o link some do header e o endereço é 404.
 */
export function PublicTokensPage() {
  const query = useTokens();
  const bodyRef = useRef<HTMLElement>(null);
  const { items, headings } = useHeadingIds(bodyRef, `tokens/${query.dataUpdatedAt}`);
  useHashScroll('tokens', headings.length);

  if (query.isLoading) return <p>Loading…</p>;
  if (query.isError) return <p role="alert">Failed to load the design tokens.</p>;
  const set = query.data;
  if (!set) return <DocsNotFound />;

  return (
    <div className="sb-page-grid">
      <article className="sb-page-body sb-tokens-page" ref={bodyRef}>
        <header className="sb-page-header">
          <h1 className="sb-public-title">Tokens</h1>
          <p className="sb-page-subtitle">
            {set.tokens.length} design tokens
            {set.modes.length > 1 ? ` in ${set.modes.length} modes (${set.modes.join(', ')})` : ''}.
          </p>
        </header>
        {tokenSections(set.tokens).map(({ group, tokens }) => {
          const title = group || 'Ungrouped';
          return (
            <section key={group}>
              <h2>{title}</h2>
              <TokenGroup tokens={tokens} modes={set.modes} label={title} />
            </section>
          );
        })}
      </article>
      <aside className="sb-page-toc">
        <TableOfContents items={items} headings={headings} />
      </aside>
    </div>
  );
}
