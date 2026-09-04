import { useEffect, useState } from 'react';

/** Quanto tempo a âncora fica confirmando a cópia antes de voltar ao repouso. */
const FEEDBACK_MS = 2000;

/**
 * Comportamento compartilhado das âncoras de link da doc pública — a de heading
 * (SYS-34) e a de bloco de código/exemplo (SYS-73). Extraído para que as duas
 * não divirjam: são a mesma promessa ao leitor, e duas cópias da mesma lógica
 * acabariam com dois comportamentos sutilmente diferentes de hash ou feedback.
 *
 * A ordem dos dois efeitos é a decisão que importa, e é herdada da SYS-34:
 * **o hash é atualizado primeiro e sempre; a cópia é o efeito secundário.**
 * `navigator.clipboard` só existe em contexto seguro (https ou localhost), e
 * numa instância self-hosted em http puro ele é `undefined` — nesse caso o botão
 * ainda faz algo útil, porque a URL da barra de endereços passou a ser o link
 * que se queria copiar.
 *
 * `replaceState` e não `location.hash = …`: um leitor que ancora cinco trechos
 * enquanto lê não deve precisar de cinco "voltar" para sair da página.
 */
export function useCopyLink(id: string) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyLink() {
    const url = `${location.origin}${location.pathname}${location.search}#${id}`;
    history.replaceState(null, '', `#${id}`);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sem clipboard: o hash já mudou, que é o comportamento mínimo útil.
    }
  }

  return { copied, copyLink };
}
