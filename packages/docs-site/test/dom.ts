import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach } from 'vitest';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Container no `document` e root do React a cada teste (arquivo com
 * `@vitest-environment jsdom`). Devolve o container atual e um `render` já
 * dentro de `act`.
 */
export function setupDom() {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  return {
    container: () => container,
    render: (node: ReactNode) => act(() => root.render(node)),
  };
}
