import type { SystemBookConfig } from '@systembook/cli';

export default {
  name: 'Acme DS',
  base: '/acme-ds/',
  logo: './brand/logo.svg',
  statusTags: [{ titulo: 'Stable', cor: '#2e7d32' }],
} satisfies SystemBookConfig;
