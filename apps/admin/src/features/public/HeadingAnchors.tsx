import { createPortal } from 'react-dom';
import { Check, Link2 } from 'lucide-react';
import { useCopyLink } from './useCopyLink.js';

/**
 * Botão "#" de uma seção (SYS-34): copia o link direto do heading e atualiza o
 * hash da URL — o mesmo par de efeitos do item do TOC, mas acionável de dentro
 * do texto, sem abrir o sumário.
 *
 * O comportamento (ordem hash→cópia, degradação sem `navigator.clipboard`,
 * duração do feedback) mora em `useCopyLink`, compartilhado com a âncora de
 * bloco da SYS-73.
 */
function HeadingAnchor({ id }: { id: string }) {
  const { copied, copyLink } = useCopyLink(id);

  return (
    <button
      type="button"
      // Lido pelo `headingText()` de `useHeadingIds` para se excluir do slug —
      // sem isso o rótulo do botão entraria no texto do heading.
      data-heading-anchor=""
      className="sb-heading-anchor"
      onClick={() => void copyLink()}
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
