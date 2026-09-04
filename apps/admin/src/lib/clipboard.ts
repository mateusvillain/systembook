/**
 * Cópia para a área de transferência com fallback (SYS-71).
 *
 * `navigator.clipboard` **só existe em contexto seguro** (https ou localhost).
 * SystemBook é self-hosted em container único, e uma instância servida em http
 * puro numa rede interna — o cenário de implantação mais banal do produto — não
 * tem a API: `navigator.clipboard` é `undefined` e `navigator.clipboard.writeText`
 * lança `TypeError` antes de qualquer `.catch()` de promise pegar.
 *
 * Onde copiar é efeito secundário isso é tolerável (a âncora de heading da SYS-34
 * ainda atualiza o hash, e a URL da barra de endereços é o link). Mas no botão de
 * copiar código copiar **é** a função inteira do botão: sem fallback ele é um
 * controle que não faz nada, sem dizer que não fez.
 *
 * Por isso a cadeia é: API assíncrona quando existe e é permitida → seleção +
 * `document.execCommand('copy')` quando não → `false`, para quem chama poder
 * dizer que falhou em vez de fingir sucesso.
 */

/**
 * Fallback pré-Clipboard-API: escreve o texto num campo fora da vista, seleciona
 * e manda o navegador copiar a seleção. `execCommand` é deprecado, mas é o único
 * caminho síncrono que funciona fora de contexto seguro, e todo navegador que
 * roda o painel ainda o implementa.
 */
function copyBySelection(text: string): boolean {
  // Guarda o foco: o campo temporário precisa ser focado para ser selecionado, e
  // devolver o foco é o que impede o clique no botão de "perder" o teclado.
  const previouslyFocused = document.activeElement;

  const field = document.createElement('textarea');
  field.value = text;
  // `fixed` + canto superior mantém o campo fora da vista sem provocar scroll da
  // página (um elemento posicionado longe no fluxo, ou com `display: none`, ou
  // não é selecionável ou empurra o layout).
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '0';
  field.style.width = '1px';
  field.style.height = '1px';
  field.style.padding = '0';
  field.style.border = 'none';
  field.style.opacity = '0';
  // Fora da ordem de tabulação e da árvore de acessibilidade enquanto existe.
  field.setAttribute('aria-hidden', 'true');
  field.tabIndex = -1;

  document.body.appendChild(field);

  let ok = false;
  try {
    field.focus({ preventScroll: true });
    field.select();
    // `setSelectionRange` além do `select()`: em iOS o `select()` sozinho não
    // cobre o conteúdo de um campo recém-inserido.
    field.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    field.remove();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
  }

  return ok;
}

/**
 * Copia `text` e devolve se conseguiu. Nunca lança: quem chama decide o que
 * mostrar em cada desfecho.
 */
export async function copyText(text: string): Promise<boolean> {
  // O optional chaining é o que evita o `TypeError` em contexto inseguro — não é
  // defensividade decorativa.
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Existe mas recusou: permissão negada, ou o documento perdeu o foco entre
      // o clique e a escrita. Ainda vale tentar a seleção.
    }
  }
  return copyBySelection(text);
}
