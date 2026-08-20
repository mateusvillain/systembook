import { createPortal } from 'react-dom';
import { CopyLinkButton } from './CopyLinkButton.js';
import type { BlockAnchorTarget } from './useBlockAnchorIds.js';

/**
 * Injeta o botão "copiar link" na barra de chrome de cada bloco ancorável
 * (SYS-73), por `createPortal` — mesma técnica de `HeadingAnchors`, e pelo mesmo
 * motivo: o DOM ali dentro é do ProseMirror, e o portal deixa o React dono do
 * ciclo de vida do botão sem `appendChild` imperativo num nó que não é dele.
 *
 * A diferença em relação ao heading é **onde o botão mora**: o heading recebe a
 * âncora dentro do próprio texto, porque ali existe linha de base e fim de frase
 * onde encostar. Um bloco de código é um cartão, e pendurar um "#" no fim do
 * código seria pendurá-lo no meio do conteúdo — então o botão entra na barra que
 * o bloco já tem no topo (de onde já sai o "Copy" do código), como segunda ação
 * do mesmo grupo.
 */
export function BlockAnchors({ anchors }: { anchors: BlockAnchorTarget[] }) {
  return (
    <>
      {anchors.map(({ id, host, label }) =>
        createPortal(
          <CopyLinkButton
            id={id}
            className="sb-block-anchor"
            iconSize={13}
            label={`Copy link to this ${label}`}
            copiedLabel={`Link to this ${label} copied`}
            title="Copy link"
          />,
          host,
          id,
        ),
      )}
    </>
  );
}
