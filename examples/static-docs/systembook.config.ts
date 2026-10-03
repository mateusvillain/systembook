import type { SystemBookConfig } from '@systembook/cli';

export default {
  name: 'Acme Design System',
  logo: './brand/logo.svg',
  logoDark: './brand/logo-dark.svg',
  // O workflow do GitHub Pages sobrescreve com SYSTEMBOOK_BASE (site de projeto
  // fica em /<repo>/); localmente, o site é servido na raiz.
  base: process.env.SYSTEMBOOK_BASE ?? '/',
  statusTags: [
    { titulo: 'Stable', cor: '#2e7d32' },
    { titulo: 'Beta', cor: '#ed6c02' },
  ],
} satisfies SystemBookConfig;
