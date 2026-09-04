import { Check, Link2 } from 'lucide-react';
import { useCopyLink } from './useCopyLink.js';

/**
 * Botão de "copiar link para aqui" da doc pública — o mesmo controle na âncora
 * de heading (SYS-34) e na de bloco de código/exemplo (SYS-73).
 *
 * O `useCopyLink` já unificava o **comportamento**; este componente unifica a
 * **marcação**, que tinha ficado bifurcada: mesmo par de ícones, mesmo
 * `data-copied`, mesma troca de rótulo. Duas cópias divergiriam justamente nos
 * detalhes que o leitor percebe (o ícone que confirma, o texto que o leitor de
 * tela ouve).
 *
 * O que varia fica em props: a classe (cada âncora tem posicionamento próprio —
 * dentro da linha do heading × na barra de chrome do bloco), o tamanho do ícone
 * e como o alvo é nomeado.
 */
export function CopyLinkButton({
  id,
  className,
  iconSize,
  /** Nome acessível em repouso, ex.: "Copy link to this section". */
  label,
  /** Nome acessível depois de copiar, ex.: "Section link copied". */
  copiedLabel,
  /** Tooltip em repouso; o estado copiado usa sempre "Link copied". */
  title,
  ...rest
}: {
  id: string;
  className: string;
  iconSize: number;
  label: string;
  copiedLabel: string;
  title: string;
} & Omit<React.ComponentProps<'button'>, 'id' | 'className' | 'title'>) {
  const { copied, copyLink } = useCopyLink(id);

  return (
    <button
      type="button"
      className={className}
      onClick={() => void copyLink()}
      data-copied={copied || undefined}
      aria-label={copied ? copiedLabel : label}
      title={copied ? 'Link copied' : title}
      {...rest}
    >
      {copied ? <Check aria-hidden size={iconSize} /> : <Link2 aria-hidden size={iconSize} />}
    </button>
  );
}
