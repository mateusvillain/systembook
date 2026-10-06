import { describe, expect, it } from 'vitest';
import { bodyViewLabel } from './PageRenderer.js';

describe('bodyViewLabel (SYS-117)', () => {
  it('usa o título customizado da tab primária', () => {
    expect(bodyViewLabel('Visão geral')).toBe('Visão geral');
    expect(bodyViewLabel('  Design  ')).toBe('Design');
  });

  it('cai em "Overview" quando vazio, ausente ou no valor legado', () => {
    expect(bodyViewLabel(undefined)).toBe('Overview');
    expect(bodyViewLabel('  ')).toBe('Overview');
    expect(bodyViewLabel('Conteúdo')).toBe('Overview');
  });
});
