import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { AppRouter } from '@systembook/server';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/trpc' })],
});

function isUnauthorized(error: unknown): boolean {
  return error instanceof TRPCClientError && error.data?.code === 'UNAUTHORIZED';
}

/**
 * Qualquer UNAUTHORIZED (sessão expirada, logout em outra aba) redireciona
 * para /login em vez de mostrar erro cru (TASK-16).
 */
function redirectToLogin(error: unknown): void {
  if (isUnauthorized(error) && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: redirectToLogin }),
  mutationCache: new MutationCache({ onError: redirectToLogin }),
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});
