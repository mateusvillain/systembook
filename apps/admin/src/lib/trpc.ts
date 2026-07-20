import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@systembook/server';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/**
 * Tipos de saída "como chegam pelo wire" (sem transformer, tRPC v11 serializa
 * o output com um `Serialize<T>` interno — datas viram string e `unknown`
 * opcional vira `?`). Componentes que recebem dados de query devem tipar a
 * partir daqui, não do tipo de domínio puro (`PageSnapshot` etc.), senão o
 * tsc reclama de incompatibilidade estrutural.
 */
export type RouterOutput = inferRouterOutputs<AppRouter>;

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
