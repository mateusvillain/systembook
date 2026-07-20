import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Em dev o painel roda no vite dev server e proxia a API para o server local.
      // Tudo same-origin: cookies de sessão funcionam sem CORS.
      '/trpc': `http://localhost:${process.env.PORT ?? 3000}`,
      // Artefatos de preview (rota da TASK-46) — é o `src` do iframe do
      // component-embed; sem este proxy o iframe daria 404 em dev.
      '/previews': `http://localhost:${process.env.PORT ?? 3000}`,
      // Endpoint de upload de preview (TASK-43) — permite testar o publish de
      // artefatos apontando para o dev server pela mesma origin do painel.
      '/api/previews': `http://localhost:${process.env.PORT ?? 3000}`,
    },
  },
});
