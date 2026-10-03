import type { SystemBookConfig } from '@systembook/cli';

export default {
  name: 'Acme Design System',
  logo: './brand/logo.svg',
  logoDark: './brand/logo-dark.svg',
  // Site de projeto do GitHub Pages fica em /<repo>/: builde com
  // SYSTEMBOOK_BASE=/<repo>/. Localmente, o site é servido na raiz.
  base: process.env.SYSTEMBOOK_BASE ?? '/',
  statusTags: [
    { titulo: 'Stable', cor: '#2e7d32' },
    { titulo: 'Beta', cor: '#ed6c02' },
  ],
} satisfies SystemBookConfig;
