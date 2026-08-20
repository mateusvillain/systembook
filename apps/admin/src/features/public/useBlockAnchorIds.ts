import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Ids estáveis para blocos de código e de exemplo na doc pública (SYS-73),
 * espelhando o que `useHeadingIds` faz com os headings: varre o DOM já
 * renderizado pelo Tiptap read-only e carimba um `id` em cada bloco elegível.
 *
 * **Por que o id não pode vir do banco.** `blocks.id` é UUID, mas o autosave
 * (`replaceBlocksForTab`, `apps/server/src/db/blocks.ts`) **apaga todos os
 * blocks da tab e reinsere**, então o mesmo bloco intocado ganha um id novo a
 * cada gravação — a SYS-59 já tinha travado essa descoberta por asserção ao
 * descobrir que ids não servem para casar dois lados de um diff. Um link
 * ancorado nesse id quebraria na primeira vez que o autor mexesse em qualquer
 * lugar da página. Além disso `blocksToTiptapDoc` nem carrega o id do bloco para
 * o nó Tiptap: ele não existe no DOM para ser lido.
 *
 * **Então o id vem do conteúdo, como o slug do heading.** É a mesma lógica que a
 * issue manda reaproveitar, e tem o mesmo perfil de falha: mudou o conteúdo,
 * mudou o link. Isso é deliberado frente à alternativa óbvia (numerar os blocos
 * na ordem: `code-1`, `code-2`), que é estável a edições mas **silenciosamente
 * errada** a inserções — bastaria alguém acrescentar um bloco de código no meio
 * da página para todo link compartilhado abaixo dele passar a apontar para o
 * bloco vizinho, sem sinal nenhum. Derivar do conteúdo troca isso por uma falha
 * benigna: o link de um bloco editado simplesmente não encontra alvo e a página
 * abre no topo.
 */

export interface BlockAnchor {
  /** O bloco em si — quem recebe o `id` e para onde a página rola. */
  block: HTMLElement;
  /** Onde o botão de âncora é montado (a barra de chrome do bloco). */
  host: HTMLElement;
  id: string;
  /** Frase usada no nome acessível do botão ("Copy link to this code example"). */
  label: string;
}

/**
 * FNV-1a de 32 bits em base36. Não é criptográfico e não precisa ser: só
 * precisa ser **determinístico** (o mesmo conteúdo dá o mesmo id em qualquer
 * navegador e em qualquer publicação) e curto o bastante para caber numa URL
 * sem poluí-la. Colisão entre dois blocos diferentes da mesma página é tratada
 * pela deduplicação abaixo, igual à de títulos repetidos nos headings.
 */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // `Math.imul` mantém a multiplicação em 32 bits; `*` viraria float e
    // perderia bits baixos, tornando o hash dependente de precisão.
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Mesmo slugify de `useHeadingIds` — ASCII-safe, único dentro da página. */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'block'
  );
}

/**
 * Identidade de um bloco de código: a linguagem mais o texto do código. O texto
 * sai do `<code>`, não do bloco inteiro — o chrome (rótulo da linguagem, botão
 * "Copy") também é texto dentro do wrapper, e incluí-lo faria o id mudar quando
 * o *rótulo* mudasse.
 *
 * O separador é um NUL, escrito como escape e **nunca como byte cru no fonte**
 * (um NUL literal faz o git tratar o arquivo como binário e parar de mostrar
 * diffs dele). Precisa ser um caractere que não apareça nem na linguagem nem no
 * código: sem separador, `('js', 'xfoo')` e `('jsx', 'foo')` teriam a mesma
 * identidade e, com ela, o mesmo id.
 */
function codeIdentity(block: HTMLElement): string {
  const code = block.querySelector('pre code')?.textContent ?? '';
  const language = block.getAttribute('data-language') ?? '';
  return `${language}\u0000${code}`;
}

/**
 * Descreve cada tipo elegível: como achar os blocos, de onde tirar a identidade
 * estável, qual prefixo de id usar e onde pendurar o botão. Um mapa em vez de
 * dois ramos espalhados pela varredura — acrescentar um tipo é acrescentar uma
 * entrada.
 */
const KINDS = [
  {
    selector: '.sb-code-block',
    prefix: 'code',
    label: 'code block',
    /** A barra que já existe no topo do bloco, ao lado do botão "Copy". */
    host: (block: HTMLElement) => block.querySelector<HTMLElement>('.sb-code-head'),
    // Slug legível não existe para código (o "título" seria o próprio código),
    // então o id é o hash — é o preço de não ter um nome humano à mão.
    slug: (block: HTMLElement) => hash(codeIdentity(block)),
  },
  {
    selector: '.sb-component-embed',
    prefix: 'example',
    label: 'example',
    /** Barra de metadados do embed vivo; ausente nos estados de placeholder. */
    host: (block: HTMLElement) => block.querySelector<HTMLElement>('.sb-component-embed-bar'),
    // Aqui existe nome humano e ele já é estável por natureza (é a referência ao
    // componente, não o conteúdo renderizado): `example-button-primary` diz o
    // que é só de olhar a URL, e um hash seria pior sem ser mais estável.
    slug: (block: HTMLElement) => {
      const name = block.getAttribute('data-component-name') ?? '';
      const variant = block.getAttribute('data-variant-id') ?? '';
      const parts = [name, variant].filter(Boolean).map(slugify);
      return parts.length > 0 ? parts.join('-') : 'unset';
    },
  },
] as const;

/**
 * Varre `containerRef` e devolve os blocos ancoráveis, já com `id` atribuído.
 *
 * `watch` deve mudar sempre que o conteúdo embaixo trocar (outra página ou tab),
 * para forçar um novo scan — mesmo contrato de `useHeadingIds`.
 */
export function useBlockAnchorIds(
  containerRef: RefObject<HTMLElement | null>,
  watch: string,
): BlockAnchor[] {
  const [anchors, setAnchors] = useState<BlockAnchor[]>([]);
  // Guarda o resultado corrente para o comparador poder devolver a **mesma**
  // referência quando nada mudou — ver a nota do observer abaixo.
  const current = useRef<BlockAnchor[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function scan() {
      const root = containerRef.current;
      if (!root) return;

      // Um seletor único preserva a **ordem do documento**; varrer por tipo e
      // concatenar agruparia todos os blocos de código antes dos exemplos, e a
      // deduplicação (que numera pela ordem de aparição) passaria a depender do
      // tipo em vez da posição na página.
      const selector = KINDS.map((k) => k.selector).join(', ');
      const found = Array.from(root.querySelectorAll<HTMLElement>(selector));

      const seen = new Map<string, number>();
      const next: BlockAnchor[] = [];

      for (const block of found) {
        const kind = KINDS.find((k) => block.matches(k.selector));
        if (!kind) continue;

        // Embed dentro de um card Do/Don't é ilustração de outro bloco, não um
        // exemplo autônomo: ancorar os dois deixaria duas âncoras concorrentes
        // na mesma região visual.
        if (block.parentElement?.closest('.sb-dos-donts')) continue;

        const host = kind.host(block);
        // Estados de placeholder do embed (sem componente escolhido, sem preview
        // publicado) não têm barra onde pendurar o botão — e são justamente os
        // que ninguém quer compartilhar por link.
        if (!host) continue;

        const base = `${kind.prefix}-${kind.slug(block)}`;
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;

        block.id = id;
        next.push({ block, host, id, label: kind.label });
      }

      const prev = current.current;
      const same =
        prev.length === next.length &&
        prev.every((a, i) => a.id === next[i]!.id && a.host === next[i]!.host);
      if (same) return;

      current.current = next;
      setAnchors(next);
    }

    // Mesmo frame de folga de `useHeadingIds`: o Tiptap monta o conteúdo num
    // efeito próprio, e varrer antes disso acharia zero blocos.
    let raf = requestAnimationFrame(scan);

    /**
     * Um scan só não basta, e o motivo é o bloco de exemplo: o `ComponentEmbed`
     * resolve o artefato de preview por rede e, **enquanto carrega, renderiza um
     * placeholder sem barra de chrome** — exatamente a barra onde a âncora é
     * pendurada. No primeiro scan o embed ainda é placeholder, é descartado por
     * não ter host, e sem reescaneio ele nunca ganharia âncora (medido: 2
     * âncoras numa página com 2 códigos e 2 exemplos).
     *
     * O observer olha só `childList`/`subtree`, não atributos — carimbar
     * `block.id` é mutação de atributo e se retroalimentaria. O portal da âncora
     * *é* uma mutação de `childList` dentro do host, então o ciclo é fechado
     * pelo comparador acima: um scan que encontra o mesmo conjunto devolve sem
     * chamar `setAnchors`, e sem novo render não há nova mutação.
     */
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
    // `watch` é o gatilho intencional de reescaneio; `containerRef` é estável.
  }, [watch]);

  return anchors;
}
