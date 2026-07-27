import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';
import { PageRenderer, type RenderableSnapshot } from './PageRenderer.js';
import { TableOfContents } from './TableOfContents.js';

/**
 * Conteúdo de uma página na doc pública (TASK-52): resolve
 * `sectionSlug`/`pageSlug` para a última revisão publicada e renderiza via
 * `PageRenderer`. A tab ativa vem da URL (`/:tabId?`) e trocar de tab atualiza
 * a URL (client-side, sem reload), tornando o link direto/bookmarkável.
 */
export function PublicPageView() {
  const { sectionSlug, pageSlug, tabId } = useParams<{
    sectionSlug: string;
    pageSlug: string;
    tabId?: string;
  }>();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const bodyRef = useRef<HTMLElement>(null);

  const query = useQuery({
    ...trpc.pages.getPublishedBySlug.queryOptions({
      sectionSlug: sectionSlug ?? '',
      pageSlug: pageSlug ?? '',
    }),
    enabled: !!sectionSlug && !!pageSlug,
  });

  if (query.isLoading) return <p>Loading…</p>;
  if (query.isError) return <p role="alert">Failed to load the page.</p>;

  // Seção/página inexistente → 404.
  if (!query.data) {
    return (
      <div data-testid="public-not-found">
        <h1 className="sb-public-title">Page not found</h1>
        <p style={{ color: '#666' }}>This page does not exist or the address has changed.</p>
      </div>
    );
  }

  const { titulo, subtitulo, snapshot } = query.data;
  // O corpo (tab primária) vive na URL sem `tabId`; as tabs de usuário em
  // `/:tabId`. Sem `tabId` na URL, a visão ativa é o corpo (TASK-68).
  const primaryTabId = snapshot?.tabs.find((t) => t.isPrimary)?.tabId;

  if (!snapshot) {
    return (
      <article>
        <header className="sb-page-header">
          <h1 className="sb-public-title">{titulo}</h1>
          {subtitulo && <p className="sb-page-subtitle">{subtitulo}</p>}
        </header>
        <div data-testid="not-published" style={{ color: '#666' }}>
          <p>This page has not been published yet.</p>
        </div>
      </article>
    );
  }

  const activeTabId = tabId ?? primaryTabId ?? snapshot.tabs[0]?.tabId ?? '';

  return (
    // Grid de leitura (2.1): conteúdo em largura confortável + coluna
    // reservada para o TOC "Nesta página" (2.2). Colapsa para 1 coluna em
    // telas estreitas via media query em `public.css`.
    <div className="sb-page-grid">
      <article className="sb-page-body" ref={bodyRef}>
        <header className="sb-page-header">
          <h1 className="sb-public-title">{titulo}</h1>
          {subtitulo && <p className="sb-page-subtitle">{subtitulo}</p>}
        </header>
        <PageRenderer
          snapshot={snapshot as RenderableSnapshot}
          activeTabId={activeTabId}
          onSelectTab={(nextTabId) =>
            navigate(
              nextTabId === primaryTabId
                ? `/docs/${sectionSlug}/${pageSlug}`
                : `/docs/${sectionSlug}/${pageSlug}/${nextTabId}`,
            )
          }
        />
      </article>
      <aside className="sb-page-toc">
        <TableOfContents
          containerRef={bodyRef}
          watch={`${sectionSlug}/${pageSlug}/${activeTabId}`}
        />
      </aside>
    </div>
  );
}
