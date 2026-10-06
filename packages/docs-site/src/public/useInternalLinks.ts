import { useCallback } from 'react';
import { useHref, useNavigate } from 'react-router-dom';
import { useDocsPaths } from './docsRoutes.js';

/**
 * Cliques em links internos do conteúdo navegam pelo router (SYS-99).
 *
 * O Link do Tiptap renderiza todo link com `target="_blank"` (padrão da
 * extensão, não escolha do autor — o Markdown nem tem como pedir isso), então
 * até um link para outra página da própria doc abria numa aba nova. Na fase de
 * captura, um link da mesma origem para uma rota da doc (base do router +
 * prefixo das rotas) vira `navigate()`: a doc troca de página sem recarregar,
 * como pelo menu. Links externos, para fora da doc (o painel, no modo CMS) ou
 * para um arquivo (`.pdf`, `.png`), e cliques com modificador (⌘/Ctrl/Shift/Alt)
 * ou botão do meio seguem o comportamento de antes.
 *
 * Devolve o handler para o `onClickCapture` do contêiner do conteúdo.
 */
/**
 * Arquivos que um link pode baixar ou abrir. Lista explícita, e não "tem
 * extensão": um slug pode ter ponto (`v1.2`) e continua sendo uma rota.
 */
const FILE_EXTENSION = /\.(pdf|zip|png|jpe?g|gif|svg|webp|avif|ico|mp4|webm|mp3|json|txt|csv|xml|md|mdx|ya?ml)$/i;

export function useInternalLinks(): (event: React.MouseEvent<HTMLElement>) => void {
  const navigate = useNavigate();
  // A base do router sem a barra final (`/meu-repo` ou `''`). O `useHref('/')`
  // a devolve com ou sem a barra, conforme a versão do React Router.
  const base = useHref('/').replace(/\/+$/, '');
  // Raiz das rotas da doc dentro da base: `/docs` no modo CMS, `''` no estático.
  const home = useDocsPaths().home;
  const docsRoot = `${base}${home === '/' ? '' : home}`;

  return useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      // Âncora da própria página (`#id`): não é navegação do router. O TOC e as
      // âncoras de heading/bloco têm handler próprio e vivem dentro deste
      // contêiner — interceptá-los aqui engolia o clique (`stopPropagation`) e o
      // `navigate` só com hash não rola o cartão, que é quem tem o scroll. Link
      // `target="_blank"` do conteúdo não pode seguir o padrão (abriria outra
      // aba): rola no lugar.
      const rawHref = anchor.getAttribute('href') ?? '';
      if (rawHref.startsWith('#')) {
        if (anchor.target !== '_blank') return;
        let id = rawHref.slice(1);
        try {
          id = decodeURIComponent(id);
        } catch {
          // Hash malformado: usa como veio.
        }
        const target = id ? document.getElementById(id) : null;
        event.preventDefault();
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', `#${id}`);
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname !== docsRoot && !url.pathname.startsWith(`${docsRoot}/`)) return;
      if (FILE_EXTENSION.test(url.pathname)) return;

      event.preventDefault();
      event.stopPropagation();
      navigate(`${url.pathname.slice(base.length) || '/'}${url.search}${url.hash}`);
    },
    [navigate, base, docsRoot],
  );
}
