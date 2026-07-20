import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { queryClient, trpcClient, TRPCProvider } from './lib/trpc.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { UploadTokensPage } from './pages/UploadTokensPage.js';
import { TabContentPage } from './pages/TabContentPage.js';
import { PageHistoryPage } from './pages/PageHistoryPage.js';
import { AdminLayout } from './components/AdminLayout.js';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'admin/users', element: <UsersPage /> },
      { path: 'admin/settings/tokens', element: <UploadTokensPage /> },
      { path: 'pages/:pageId/tabs/:tabId', element: <TabContentPage /> },
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
