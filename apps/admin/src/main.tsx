import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { queryClient, trpcClient, TRPCProvider } from './lib/trpc.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { UploadTokensPage } from './pages/UploadTokensPage.js';
import { LandingPageSettingsPage } from './pages/LandingPageSettingsPage.js';
import { PageContentPage } from './pages/PageContentPage.js';
import { PageHistoryPage } from './pages/PageHistoryPage.js';
import { GlobalHistoryPage } from './pages/GlobalHistoryPage.js';
import { PublicPage } from './pages/PublicPage.js';
import { PublicLayout } from './features/public/PublicLayout.js';
import { PublicHome } from './features/public/PublicHome.js';
import { PublicPageView } from './features/public/PublicPageView.js';
import { AdminLayout } from './components/AdminLayout.js';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // Doc pública navegável (TASK-52) — árvore de rotas separada do AdminLayout:
  // sem auth, sem chrome de admin.
  {
    path: '/docs',
    element: <PublicLayout />,
    children: [
      { index: true, element: <PublicHome /> },
      { path: ':sectionSlug/:pageSlug', element: <PublicPageView /> },
      { path: ':sectionSlug/:pageSlug/:tabId', element: <PublicPageView /> },
    ],
  },
  // Link direto por id (TASK-50) — mantido para bookmarks/preview sem slug.
  { path: '/p/:pageId', element: <PublicPage /> },
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'admin/users', element: <UsersPage /> },
      { path: 'admin/settings/tokens', element: <UploadTokensPage /> },
      { path: 'admin/settings/landing-page', element: <LandingPageSettingsPage /> },
      { path: 'admin/history', element: <GlobalHistoryPage /> },
      { path: 'pages/:pageId', element: <PageContentPage /> },
      { path: 'pages/:pageId/tabs/:tabId', element: <PageContentPage /> },
      { path: 'pages/:pageId/history', element: <PageHistoryPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
