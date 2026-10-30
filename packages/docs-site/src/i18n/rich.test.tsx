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

  it('mantém variável sem nó e texto sem variável', () => {
    dom.render(<p>{formatRich('Olá, {name}!', {})}</p>);
    expect(dom.container().textContent).toBe('Olá, {name}!');
    dom.render(<p>{formatRich('Sem nada', { x: <b>x</b> })}</p>);
    expect(dom.container().textContent).toBe('Sem nada');
  });

  it('ignora propriedades herdadas', () => {
    dom.render(<p>{formatRich('{toString}', {})}</p>);
    expect(dom.container().textContent).toBe('{toString}');
  });
});
