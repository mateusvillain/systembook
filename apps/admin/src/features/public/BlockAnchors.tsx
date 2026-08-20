import { createPortal } from 'react-dom';
import { Check, Link2 } from 'lucide-react';
import { useCopyLink } from './useCopyLink.js';
import type { BlockAnchor as BlockAnchorInfo } from './useBlockAnchorIds.js';

/**
 * Botão "copiar link" de um bloco de código/exemplo (SYS-73) — a âncora de
 * heading da SYS-34 estendida para os blocos que o leitor mais quer
 * compartilhar. Mesmo ícone, mesmo feedback de 2s e o mesmo `useCopyLink`.
 *
 * A diferença é **onde ele mora**: o heading recebe a âncora dentro do próprio
 * texto, porque ali existe uma linha de base e um fim de frase onde encostar.
 * Um bloco de código é um cartão, e pendurar um "#" no fim do código seria
 * pendurá-lo no meio do conteúdo — então o botão entra na barra de chrome que o
 * bloco já tem no topo (o mesmo lugar de onde já sai o "Copy" do código), como
 * uma segunda ação do mesmo grupo.
 */
function BlockAnchor({ id, label }: { id: string; label: string }) {
  const { copied, copyLink } = useCopyLink(id);

  return (
    <button
      type="button"
      className="sb-block-anchor"
      onClick={() => void copyLink()}
      data-copied={copied || undefined}
      // O nome acessível diz de que bloco é o link: uma página com seis blocos
      // de código teria seis botões de nome idêntico para quem navega por lista.
      aria-label={copied ? `Link to this ${label} copied` : `Copy link to this ${label}`}
      title={copied ? 'Link copied' : 'Copy link'}
    >
      {copied ? <Check aria-hidden size={13} /> : <Link2 aria-hidden size={13} />}
    </button>
  );
}

/**
 * Injeta a âncora na barra de chrome de cada bloco ancorável, por `createPortal`
 * — mesma técnica de `HeadingAnchors`, e pelo mesmo motivo: o DOM ali dentro é
 * do ProseMirror, e o portal deixa o React dono do ciclo de vida do botão sem
 * `appendChild` imperativo num nó que não é dele.
 */
export function BlockAnchors({ anchors }: { anchors: BlockAnchorInfo[] }) {
  return (
    <>
      {anchors.map(({ id, host, label }) =>
        createPortal(<BlockAnchor id={id} label={label} />, host, id),
      )}
    </>
  );
}
