import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc.js';
import { PageRenderer, type RenderableSnapshot } from './PageRenderer.js';
import { TableOfContents } from './TableOfContents.js';
import { HeadingAnchors } from './HeadingAnchors.js';
import { useHeadingIds } from './useHeadingIds.js';
import { LegacyDocsRedirect } from './LegacyDocsRedirect.js';

/**
 * Conteúdo de uma página na doc pública (TASK-52): resolve
 * `menuSlug`/`sectionSlug`/`pageSlug` para a última revisão publicada e
 * renderiza via `PageRenderer`. A tab ativa vem da URL (`/:tabId?`) e trocar
 * de tab atualiza a URL (client-side, sem reload), tornando o link
 * direto/bookmarkável.
 */
export function PublicPageView() {
  const { menuSlug, sectionSlug, pageSlug, tabId } = useParams<{
    menuSlug: string;
    sectionSlug: string;
    pageSlug: string;
    tabId?: string;
  }>();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const bodyRef = useRef<HTMLElement>(null);

  const query = useQuery({
    ...trpc.pages.getPublishedBySlug.queryOptions({
      menuSlug: menuSlug ?? '',
      sectionSlug: sectionSlug ?? '',
      pageSlug: pageSlug ?? '',
    }),
    enabled: !!menuSlug && !!sectionSlug && !!pageSlug,
  });

  const basePath = `/docs/${menuSlug}/${sectionSlug}/${pageSlug}`;

  // Antes dos early returns (regras de hooks). O gatilho de reescaneio é a rota
  // **mais** `dataUpdatedAt`: só a rota não bastaria, porque na primeira
  // montagem o conteúdo ainda não chegou e a varredura acharia zero headings —
  // é a chegada dos dados que precisa disparar o scan.
  const { items, headings } = useHeadingIds(
    bodyRef,
    `${menuSlug}/${sectionSlug}/${pageSlug}/${tabId ?? ''}/${query.dataUpdatedAt}`,
  );

  if (query.isLoading) return <p>Loading…</p>;
  if (query.isError) return <p role="alert">Failed to load the page.</p>;

  // Não resolveu como `menu/section/page`. Com 3 segmentos isso ainda pode ser
  // a forma legada `section/page/tab` (SYS-37), então o resolvedor do servidor
  // decide — e só ele conclui pelo 404.
  if (!query.data) return <LegacyDocsRedirect />;

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
            navigate(nextTabId === primaryTabId ? basePath : `${basePath}/${nextTabId}`)
          }
        />
        {/* Âncora "#" dentro de cada heading (SYS-34). Renderizada aqui, e não
            no `PageRenderer`, porque depende dos `id` que o hook atribui — e o
            renderer é compartilhado com o preview de revisões do admin, onde
            link de seção não faz sentido. */}
        <HeadingAnchors headings={headings} />
      </article>
      <aside className="sb-page-toc">
        <TableOfContents items={items} headings={headings} />
      </aside>
    </div>
  );
}
