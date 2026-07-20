// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewConfig } from '@systembook/schema';
import { mount, UPDATE_PROPS_MESSAGE_TYPE, type PreviewHandle } from './mount.js';

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
});
