// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setupDom } from '../../test/dom.js';
import { formatRich } from './rich.js';

const dom = setupDom();

describe('formatRich (SYS-168)', () => {
  it('troca as variáveis pelos nós, na ordem da mensagem', () => {
    dom.render(<p>{formatRich('Prévia de {component} ({variant})', { component: <strong>Botão</strong>, variant: 'primário' })}</p>);
    expect(dom.container().innerHTML).toBe('<p>Prévia de <strong>Botão</strong> (primário)</p>');
  });

  it('mantém variável sem nó', () => {
    dom.render(<p>{formatRich('Olá, {name}!', {})}</p>);
    expect(dom.container().textContent).toBe('Olá, {name}!');
  });

  it('nó sem variável na mensagem entra no fim, sem sumir', () => {
    dom.render(<p>{formatRich('Comece aqui.', { page: <a href="/x">Paleta</a> })}</p>);
    expect(dom.container().innerHTML).toBe('<p>Comece aqui. <a href="/x">Paleta</a></p>');
  });

  it('ignora propriedades herdadas', () => {
    dom.render(<p>{formatRich('{toString}', {})}</p>);
    expect(dom.container().textContent).toBe('{toString}');
  });
});
