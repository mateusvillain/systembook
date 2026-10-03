import type { SystemBookConfig } from '@systembook/cli';

export default {
  name: 'Acme Design System',
  logo: './brand/logo.svg',
  logoDark: './brand/logo-dark.svg',
  statusTags: [
    { titulo: 'Stable', cor: '#2e7d32' },
    { titulo: 'Beta', cor: '#ed6c02' },
  ],
} satisfies SystemBookConfig;
