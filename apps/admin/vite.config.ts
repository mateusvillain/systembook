import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Em dev o painel roda no vite dev server e proxia a API para o server local.
      '/trpc': `http://localhost:${process.env.PORT ?? 3000}`,
    },
  },
});
