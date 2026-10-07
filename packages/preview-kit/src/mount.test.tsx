// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewConfig } from '@systembook/schema';
import { mount, SET_TOKENS_MESSAGE_TYPE, UPDATE_PROPS_MESSAGE_TYPE, type PreviewHandle } from './mount.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const PARENT_ORIGIN = 'https://painel.example';

function SampleButton(props: Record<string, unknown>) {
  return (
    <button disabled={Boolean(props.disabled)} data-variant={String(props.variant ?? '')}>
      {String(props.children ?? '')}
    </button>
  );
}

const config: PreviewConfig = {
  component: 'Button',
  variants: [
    { id: 'primary', label: 'Primary', props: { variant: 'primary', children: 'Salvar' } },
    { id: 'disabled', label: 'Disabled', props: { variant: 'primary', disabled: true, children: 'Salvar' } },
  ],
  controls: [
    { kind: 'text', propName: 'children' },
    { kind: 'boolean', propName: 'disabled' },
  ],
};

function dispatchUpdateProps(props: Record<string, unknown>, origin: string) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: UPDATE_PROPS_MESSAGE_TYPE, props },
      origin,
    }),
  );
}

function dispatchSetTokens(data: Record<string, unknown>, origin: string) {
  window.dispatchEvent(new MessageEvent('message', { data: { type: SET_TOKENS_MESSAGE_TYPE, ...data }, origin }));
}

const TOKENS_CSS = ':root, [data-mode="light"] {\n  --bg: #fff;\n}\n\n[data-mode="dark"] {\n  --bg: #000;\n}';

const tokenStyles = () => document.head.querySelectorAll('style[data-systembook-tokens]');

describe('preview-kit mount()', () => {
  let container: HTMLElement;
  let handle: PreviewHandle | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    handle = undefined;
  });

  afterEach(async () => {
    await act(async () => handle?.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('renderiza as props iniciais da variante pedida', async () => {
    await act(async () => {
      handle = mount(container, config, SampleButton, {
        variantId: 'primary',
        allowedOrigin: PARENT_ORIGIN,
      });
    });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Salvar');
    expect(button?.disabled).toBe(false);
    expect(button?.dataset.variant).toBe('primary');
  });

  it('variantId desconhecida renderiza estado de erro em vez de lançar', async () => {
    await act(async () => {
      handle = mount(container, config, SampleButton, {
        variantId: 'nao-existe',
        allowedOrigin: PARENT_ORIGIN,
      });
    });

    const error = container.querySelector('[data-preview-error]');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('nao-existe');
    expect(error?.textContent).toContain('primary, disabled');
    expect(container.querySelector('button')).toBeNull();
  });

  it('mensagem systembook:update-props mescla props e re-renderiza', async () => {
    await act(async () => {
      handle = mount(container, config, SampleButton, {
        variantId: 'primary',
        allowedOrigin: PARENT_ORIGIN,
      });
    });

    await act(async () => {
      dispatchUpdateProps({ disabled: true }, PARENT_ORIGIN);
    });

    const button = container.querySelector('button');
    // merge: children da variante permanece, disabled foi sobrescrito
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe('Salvar');

    await act(async () => {
      dispatchUpdateProps({ children: 'Enviar' }, PARENT_ORIGIN);
    });
    expect(container.querySelector('button')?.textContent).toBe('Enviar');
    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('mensagem de origin não permitida é ignorada com warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await act(async () => {
      handle = mount(container, config, SampleButton, {
        variantId: 'primary',
        allowedOrigin: PARENT_ORIGIN,
      });
    });

    await act(async () => {
      dispatchUpdateProps({ disabled: true }, 'https://malicioso.example');
    });

    expect(container.querySelector('button')?.disabled).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('malicioso.example');
  });

  it('mensagens com shape estranho são ignoradas em silêncio', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await act(async () => {
      handle = mount(container, config, SampleButton, {
        variantId: 'primary',
        allowedOrigin: PARENT_ORIGIN,
      });
    });

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: 'string qualquer', origin: PARENT_ORIGIN }));
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'outro' }, origin: PARENT_ORIGIN }));
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: UPDATE_PROPS_MESSAGE_TYPE, props: null },
          origin: PARENT_ORIGIN,
        }),
      );
    });

    expect(container.querySelector('button')?.textContent).toBe('Salvar');
    expect(warn).not.toHaveBeenCalled();
  });

  it('sem allowedOrigin explícita, aceita a própria origin (sem referrer)', async () => {
    // jsdom: document.referrer === '' → fallback para window.location.origin
    await act(async () => {
      handle = mount(container, config, SampleButton, { variantId: 'primary' });
    });

    await act(async () => {
      dispatchUpdateProps({ children: 'Local' }, window.location.origin);
    });

    expect(container.querySelector('button')?.textContent).toBe('Local');
  });

  it('unmount() remove o listener de mensagens', async () => {
    await act(async () => {
      handle = mount(container, config, SampleButton, {
        variantId: 'primary',
        allowedOrigin: PARENT_ORIGIN,
      });
    });

    await act(async () => handle!.unmount());
    handle = undefined;

    // sem root montado, dispatch não pode causar erro nem re-render
    await act(async () => {
      dispatchUpdateProps({ children: 'Depois' }, PARENT_ORIGIN);
    });
    expect(container.textContent).toBe('');
  });

  describe('systembook:set-tokens', () => {
    beforeEach(async () => {
      await act(async () => {
        handle = mount(container, config, SampleButton, { variantId: 'primary', allowedOrigin: PARENT_ORIGIN });
      });
    });

    it('injeta as variáveis num <style> e põe o modo no <html>', async () => {
      await act(async () => dispatchSetTokens({ css: TOKENS_CSS, mode: 'light' }, PARENT_ORIGIN));

      expect(tokenStyles()).toHaveLength(1);
      expect(tokenStyles()[0]?.textContent).toBe(TOKENS_CSS);
      expect(document.documentElement.getAttribute('data-mode')).toBe('light');
      // O componente segue montado: os tokens não re-renderizam nada.
      expect(container.querySelector('button')?.textContent).toBe('Salvar');
    });

    it('trocar de modo troca o atributo e reaproveita o mesmo <style>', async () => {
      await act(async () => dispatchSetTokens({ css: TOKENS_CSS, mode: 'light' }, PARENT_ORIGIN));
      await act(async () => dispatchSetTokens({ css: TOKENS_CSS, mode: 'dark' }, PARENT_ORIGIN));

      expect(tokenStyles()).toHaveLength(1);
      expect(document.documentElement.getAttribute('data-mode')).toBe('dark');

      await act(async () => dispatchSetTokens({ css: '[data-mode="dark"] { --bg: #111; }', mode: 'dark' }, PARENT_ORIGIN));
      expect(tokenStyles()).toHaveLength(1);
      expect(tokenStyles()[0]?.textContent).toContain('#111');
    });

    it('origin não permitida e shape estranho não aplicam nada', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await act(async () => {
        dispatchSetTokens({ css: TOKENS_CSS, mode: 'dark' }, 'https://malicioso.example');
        dispatchSetTokens({ css: 42, mode: 'dark' }, PARENT_ORIGIN);
        dispatchSetTokens({ css: TOKENS_CSS }, PARENT_ORIGIN);
      });

      expect(tokenStyles()).toHaveLength(0);
      expect(document.documentElement.hasAttribute('data-mode')).toBe(false);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toContain('systembook:set-tokens');
    });

    it('unmount() remove o <style> e o modo', async () => {
      await act(async () => dispatchSetTokens({ css: TOKENS_CSS, mode: 'dark' }, PARENT_ORIGIN));
      await act(async () => handle!.unmount());
      handle = undefined;

      expect(tokenStyles()).toHaveLength(0);
      expect(document.documentElement.hasAttribute('data-mode')).toBe(false);
    });
  });
});
