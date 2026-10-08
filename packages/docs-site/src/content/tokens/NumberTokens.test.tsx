// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token, TokenValue } from '@systembook/schema';
import { setupDom } from '../../../test/dom.js';
import { NumberTokens } from './NumberTokens.js';

const dom = setupDom();

const token = (path: string, value: TokenValue): Token => ({
  path,
  type: 'number',
  byMode: { default: { value, resolvedValue: value } },
});

const opacities = () =>
  [...dom.container().querySelectorAll<HTMLElement>('.sb-token-opacity')].map((el) => el.style.getPropertyValue('--sb-token-opacity'));

describe('NumberTokens (SYS-150)', () => {
  it('opacidade pelo caminho vira amostra; outros números, só o valor', () => {
    dom.render(
      <NumberTokens
        tokens={[
          token('acme.opacity.disabled', 0.5),
          token('overlay.backdropOpacity', 0.64),
          token('scrim-alpha', 1),
          token('z.index.modal', 1000),
          token('opacity.weird', 1.5),
          token('line.ratio', 0.5),
        ]}
        modes={['default']}
      />,
    );
    expect(opacities()).toEqual(['0.5', '0.64', '1']);
    expect(dom.container().querySelector('.sb-token-opacity')!.getAttribute('aria-hidden')).toBe('true');
    expect([...dom.container().querySelectorAll('.sb-token-value')].map((v) => v.textContent)).toEqual(['0.5', '0.64', '1', '1000', '1.5', '0.5']);
  });

  it('convenções por nome (SYS-154): camada, entrelinha, proporção', () => {
    dom.render(
      <NumberTokens
        tokens={[
          token('zIndex.base', 0),
          token('z-index.modal', 1400),
          token('layer.toast', 1500),
          token('layer.odd', 1.23456),
          token('lineHeight.normal', 1.5),
          token('leading.huge', 9),
          token('aspect-ratio.video', 1.7778),
          token('contrast.ratio.aa', 4.5),
        ]}
        modes={['default']}
      />,
    );
    const stacks = [...dom.container().querySelectorAll('.sb-token-stack')];
    expect(stacks).toHaveLength(4);
    // quatro valores distintos: cada token destaca a sua altura na pilha (1.23456 entre 0 e 1400, mesmo com o CSS arredondado)
    expect(stacks.map((s) => [...s.children].findIndex((l) => l.hasAttribute('data-current')))).toEqual([0, 2, 3, 1]);
    expect([...dom.container().querySelectorAll<HTMLElement>('.sb-token-text-sample')].map((t) => t.style.lineHeight)).toEqual(['1.5']);
    expect(
      [...dom.container().querySelectorAll<HTMLElement>('.sb-token-aspect-ratio')].map((a) => a.style.getPropertyValue('--sb-token-aspect-ratio')),
    ).toEqual(['1.7778']);
  });
});
