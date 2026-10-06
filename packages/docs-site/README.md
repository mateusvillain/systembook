# @systembook/docs-site

A documentação pública do [Systembook](https://github.com/mateusvillain/systembook) e a camada de renderização de conteúdo (extensões Tiptap, NodeViews e estilos), independentes de onde o conteúdo vem.

O mesmo site roda sobre o servidor do Systembook (modo CMS) ou sobre arquivos gerados no build (modo estático). Quem monta o site fornece a fonte de dados, implementando o contrato `DocsDataSource` de [`@systembook/schema`](https://www.npmjs.com/package/@systembook/schema):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import {
  DocsDataSourceProvider,
  PublicHome,
  PublicLayout,
  PublicPageView,
} from '@systembook/docs-site';

const router = createBrowserRouter([
  {
    path: '/docs',
    element: <PublicLayout />,
    children: [
      { index: true, element: <PublicHome /> },
      { path: ':menuSlug/:sectionSlug/:pageSlug', element: <PublicPageView /> },
      { path: ':menuSlug/:sectionSlug/:pageSlug/:tabId', element: <PublicPageView /> },
    ],
  },
]);

<QueryClientProvider client={new QueryClient()}>
  <DocsDataSourceProvider dataSource={myDataSource}>
    <RouterProvider router={router} />
  </DocsDataSourceProvider>
</QueryClientProvider>;
```

`react`, `react-dom`, `react-router-dom` e `@tanstack/react-query` são peer dependencies: o site compartilha o router e o cache de quem o monta.

Os componentes importam o próprio CSS (requer um bundler que trate `import './x.css'`, como o Vite). Os estilos também ficam expostos em `@systembook/docs-site/content.css` e `@systembook/docs-site/public.css`, para quem precisa controlar a ordem na cascata.

O painel de controles do component-embed usa utilities do Tailwind CSS v4. Quem consome o pacote com Tailwind precisa incluí-lo nas fontes (`@source`).
