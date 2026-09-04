import { useEffect, useRef } from 'react';

/**
 * Rola até o elemento apontado pelo `#hash` da URL depois que o conteúdo
 * existe (SYS-73).
 *
 * **Por que isso precisa de código.** Duas coisas, somadas, impedem o navegador
 * de fazer sozinho o que faria numa página estática:
 *
 * 1. Os `id` de âncora não vêm no HTML — são carimbados por JS (`useHeadingIds`,
 *    `useBlockAnchorIds`) depois de o Tiptap montar o conteúdo. Quando o
 *    navegador processa o hash, no load, o alvo ainda não existe.
 * 2. Quem rola **não é a janela**: desde a 6.1 o container de scroll é
 *    `.sb-public-content`, e o ajuste nativo de hash mexe no scroll do documento.
 *
 * O efeito disso era um link de âncora que copiava certo e não levava a lugar
 * nenhum ao ser aberto — medido antes desta mudança: abrir a doc com `#título-3`
 * deixava o container em `scrollTop: 0`. Vale tanto para as âncoras de bloco
 * desta issue quanto para as de heading da SYS-34, que sempre tiveram o furo.
 *
 * `behavior: 'auto'` de propósito: isto é a **chegada** na página, não uma
 * navegação dentro dela (o clique no TOC usa `smooth`, porque ali o leitor vê o
 * ponto de partida). Rolar suavemente do topo até o meio de uma página que
 * acabou de abrir é animação sem informação — e em `prefers-reduced-motion`
 * seria animação indesejada.
 *
 * Os dois parâmetros são deliberadamente separados:
 *
 * - `contentKey` identifica **o que** está sendo lido (rota + tab). É o que
 *   define quando um novo salto é legítimo: o leitor navegou para outro lugar.
 * - `generation` é só um gatilho de nova tentativa, e muda enquanto o mesmo
 *   conteúdo se acomoda. O alvo pode aparecer **depois** da primeira tentativa:
 *   o bloco de exemplo resolve o preview por rede e só então recebe id, então
 *   uma única tentativa na montagem erraria justamente os links de exemplo.
 *
 * Encaixar os dois numa string só (e reparti-la aqui) foi como uma versão
 * anterior fez, e escondia um defeito: a metade "identidade" incluía o
 * `dataUpdatedAt` da query, então **qualquer refetch** cunhava uma chave nova e
 * disparava um segundo `scrollIntoView`, puxando de volta um leitor que já
 * tinha rolado para outro lugar. Hoje isso é raro porque o painel roda com
 * `refetchOnWindowFocus: false` (`lib/trpc.ts`) — era uma armadilha esperando a
 * primeira invalidação de cache, não um bug visível.
 */
export function useHashScroll(contentKey: string, generation: number) {
  /**
   * Que hash já foi atendido, e sob qual conteúdo. Sem isso, cada vez que um
   * embed terminasse de carregar o efeito rodaria de novo e **puxaria o leitor
   * de volta** para o bloco, mesmo que ele já tivesse rolado para outro lugar.
   */
  const done = useRef<string | null>(null);

  useEffect(() => {
    const raw = location.hash.slice(1);
    if (!raw) return;

    // O hash chega percent-encoded quando o slug tem acento (`#t%C3%ADtulo-3`),
    // e `getElementById` compara com o id cru.
    let id: string;
    try {
      id = decodeURIComponent(raw);
    } catch {
      // Hash malformado (`%` solto): usa como veio em vez de estourar.
      id = raw;
    }

    // A chave de "já atendido" é por conteúdo, não por scan: `generation` faz o
    // efeito rodar de novo, mas não autoriza um segundo salto.
    const key = `${contentKey}#${id}`;
    if (done.current === key) return;

    const target = document.getElementById(id);
    // Ainda não existe (o bloco de exemplo pode estar carregando): não marca
    // como atendido, e a próxima mudança de `signal` tenta de novo.
    if (!target) return;

    done.current = key;

    // Um frame de folga: o alvo pode ter acabado de receber o id, e medir a
    // posição antes do layout do quadro atual erraria o destino.
    const raf = requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    });

    return () => cancelAnimationFrame(raf);
    // O hash **não** entra nas deps de propósito: cliques na própria página o
    // atualizam por `replaceState` (`useCopyLink`), e reagir a isso puxaria a
    // página de volta ao bloco toda vez que alguém copiasse um link.
  }, [contentKey, generation]);
}
