import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Link2 } from 'lucide-react';

const FEEDBACK_MS = 2000;

/**
 * Botão "#" de uma seção (SYS-34): copia o link direto do heading e atualiza o
 * hash da URL — o mesmo par de efeitos do item do TOC, mas acionável de dentro
 * do texto, sem abrir o sumário.
 *
 * `navigator.clipboard` só existe em contexto seguro (https ou localhost); numa
 * instância self-hosted servida em http puro ele é `undefined`. Nesse caso o
 * botão **ainda funciona**: atualiza o hash, e a URL da barra de endereços passa
 * a ser o link a copiar à mão. Por isso a cópia é o efeito secundário, e não a
 * razão de o botão existir.
 */
function HeadingAnchor({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), FEEDBACK_MS);
    return () => clearTimeout(t);
  }, [copied]);

  async function onClick() {
    const url = `${location.origin}${location.pathname}${location.search}#${id}`;
    // `replaceState` (não `location.hash = …`) para não empilhar uma entrada de
    // histórico por clique — igual ao item do TOC.
    history.replaceState(null, '', `#${id}`);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sem clipboard: o hash já mudou, que é o comportamento mínimo útil.
    }
  }

  return (
    <button
      type="button"
      // Lido pelo `headingText()` de `useHeadingIds` para se excluir do slug —
      // sem isso o rótulo do botão entraria no texto do heading.
      data-heading-anchor=""
      className="sb-heading-anchor"
      onClick={onClick}
      // O nome acessível diz *qual* seção: um leitor de tela tabulando a página
      // ouviria "copiar link" N vezes idênticas sem ele.
      aria-label={copied ? 'Section link copied' : 'Copy link to this section'}
      title={copied ? 'Link copied' : 'Copy link to this section'}
      data-copied={copied || undefined}
    >
      {copied ? <Check aria-hidden size={14} /> : <Link2 aria-hidden size={14} />}
    </button>
  );
}

/**
 * Injeta a âncora dentro de cada heading do conteúdo, por `createPortal`.
 *
 * O DOM da prosa é do ProseMirror, então nada aqui é criado com
 * `innerHTML`/`appendChild` imperativo: o portal deixa o React dono do ciclo de
 * vida do botão (montagem, atualização de estado e remoção) dentro de um nó que
 * não é dele. Em modo read-only o ProseMirror não reescreve esse DOM, e quando o
 * conteúdo troca de verdade (outra página ou tab) a lista de headings é
 * reescaneada e os portais passam a apontar para os nós novos.
 */
export function HeadingAnchors({ headings }: { headings: HTMLHeadingElement[] }) {
  return (
    <>
      {headings.map((heading) =>
        heading.id ? createPortal(<HeadingAnchor id={heading.id} />, heading, heading.id) : null,
      )}
    </>
  );
}
