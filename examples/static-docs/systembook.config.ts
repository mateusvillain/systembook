import type { SystemBookConfig } from '@systembook/cli';

export default {
  name: 'Acme Design System',
  logo: './brand/logo.svg',
  logoDark: './brand/logo-dark.svg',
  statusTags: [
    { titulo: 'Stable', cor: '#2e7d32' },
    { titulo: 'Beta', cor: '#ed6c02' },
  ],
  // Design tokens DTCG: a paleta e o resto ficam no base; as cores de papel,
  // em um arquivo por modo (docs/tokens.md no repositório do Systembook).
  tokens: {
    files: 'tokens/base.json',
    modes: {
      light: 'tokens/light.json',
      dark: 'tokens/dark.json',
    },
  },
} satisfies SystemBookConfig;
