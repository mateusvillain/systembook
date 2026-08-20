import { createPortal } from 'react-dom';
import { CopyLinkButton } from './CopyLinkButton.js';

/**
 * Botão "#" de uma seção (SYS-34): copia o link direto do heading e atualiza o
 * hash da URL — o mesmo par de efeitos do item do TOC, mas acionável de dentro
 * do texto, sem abrir o sumário.
 *
 * Comportamento e marcação vivem em `CopyLinkButton`, compartilhado com a âncora
 * de bloco da SYS-73; aqui fica só o que é específico do heading.
 */
function HeadingAnchor({ id }: { id: string }) {
  return (
    <CopyLinkButton
      id={id}
      className="sb-heading-anchor"
      iconSize={14}
      // O nome acessível diz *qual* alvo: um leitor de tela tabulando a página
      // ouviria "copiar link" N vezes idênticas sem ele.
      label="Copy link to this section"
      copiedLabel="Section link copied"
      title="Copy link to this section"
      // Lido pelo `headingText()` de `useHeadingIds` para se excluir do slug —
      // sem isso o rótulo do botão entraria no texto do heading.
      data-heading-anchor=""
    />
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
