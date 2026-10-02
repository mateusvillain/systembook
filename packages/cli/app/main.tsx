import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { createDocsRoute, createStaticDataSource, DocsDataSourceProvider } from '@systembook/docs-site';
import { STATIC_DATA_DIR } from '@systembook/content/site';

/**
 * O site do modo estático (SYS-99): a doc pública na raiz, sob a base de
 * publicação, lendo os JSONs que o `systembook build` escreve. A base vem do
 * Vite (`base` da config), então assets, router e dados concordam.
 */
const base = import.meta.env.BASE_URL;

const router = createBrowserRouter([createDocsRoute('')], {
  // `/meu-repo/` → `/meu-repo`; na raiz, sem basename.
  basename: base.replace(/\/$/, '') || undefined,
});

const queryClient = new QueryClient({
  // Os dados são estáticos: não há o que revalidar ao focar a janela.
  defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false } },
});

/**
 * O `index.html` de cada rota já vem com `<title>` e meta description; ao
 * navegar sem recarregar, o app aplica os da rota nova (`heads.json`, escrito
 * pelo build).
 */
let heads: Promise<Map<string, { title: string; description: string }>> | null = null;
router.subscribe(async ({ location }) => {
  heads ??= fetch(`${base}${STATIC_DATA_DIR}heads.json`)
    .then((r) => r.json() as Promise<{ path: string; title: string; description: string }[]>)
    .then((list) => new Map(list.map((h) => [h.path, h])))
    .catch(() => new Map());
  // A rota de `heads.json` é relativa à base; o `pathname` do router pode
  // trazê-la ou não, conforme a versão do React Router.
  const root = base.replace(/\/$/, '');
  const pathname = root && location.pathname.startsWith(root) ? location.pathname.slice(root.length) : location.pathname;
  const head = (await heads).get(pathname.replace(/\/$/, ''));
  if (!head) return;
  document.title = head.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', head.description);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DocsDataSourceProvider dataSource={createStaticDataSource({ dataUrl: `${base}${STATIC_DATA_DIR}` })}>
        <RouterProvider router={router} />
      </DocsDataSourceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
