import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  Check,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
  Unlink,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Menu de formatação flutuante (TASK-102): substitui a toolbar fixa —
 * mesmas ações (títulos, negrito/itálico, listas, bloco de código), mas só
 * aparece sobre a seleção de texto, como o menu do `referencia-4.png`. Ícones
 * de "Improve with AI"/sublinhado/sobrescrito/citação do print de referência
 * ficaram de fora: nenhum desses marks/nodes existe no schema
 * (`extensions.ts`) e não é escopo desta task inventá-los — só reaproveitar
 * exatamente o que a `EditorToolbar` já oferecia (link adicionado depois,
 * SYS-29).
 */

/** Prepende `https://` quando o usuário digita sem protocolo (ex.: "exemplo.com"). */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Garante que existe algo para receber o link antes de abrir o editor (SYS-65).
 * Com o cursor solto, Cmd+K não teria alvo — e obrigar a selecionar antes é
 * exatamente a fricção que a épica remove. Em ordem:
 *
 * 1. já há seleção → usa como está;
 * 2. cursor **dentro de um link** → estende para o link inteiro, que é o que
 *    "editar este link" significa (e é o que faz o Remove funcionar sem mira);
 * 3. cursor **dentro de uma palavra** → seleciona a palavra;
 * 4. nada em volta (linha vazia, espaço) → devolve `false`, e quem chama
 *    insere a própria URL como texto do link ao confirmar.
 */
function selectLinkTarget(editor: Editor): boolean {
  const { state } = editor;
  const { selection } = state;
  // "Tem seleção" não basta: depois de um Cmd+A seguido de Delete o
  // ProseMirror deixa uma `AllSelection` sobre um documento vazio, que **não**
  // é `empty` e enganaria a checagem — o alvo tem que ter texto de verdade,
  // senão `setLink` marcaria o nada e a página ficaria em branco.
  if (!selection.empty && state.doc.textBetween(selection.from, selection.to, ' ').trim() !== '') {
    return true;
  }

  if (editor.isActive('link')) {
    editor.commands.extendMarkRange('link');
    return true;
  }

  const { $from } = selection;
  const text = $from.parent.textContent;
  const offset = $from.parentOffset;
  const isWordChar = (char: string | undefined) => !!char && !/\s/.test(char);

  let start = offset;
  let end = offset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;
  if (start === end) return false;

  const base = $from.start();
  editor.commands.setTextSelection({ from: base + start, to: base + end });
  return true;
}

function BubbleButton({
  label,
  title,
  active = false,
  onClick,
}: {
  label: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      // Mantém a seleção/foco no editor ao clicar (senão a seleção usada pelo
      // comando já teria colapsado antes do onClick rodar).
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-editorial-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4',
        active && 'bg-accent text-foreground',
      )}
    >
      {label}
    </button>
  );
}

export function BubbleFormatMenu({
  editor,
  linkRequest = 0,
}: {
  editor: Editor | null;
  /**
   * Contador incrementado a cada Cmd/Ctrl+K. É contador e não booleano porque
   * o mesmo atalho apertado de novo depois de cancelar precisa reabrir — um
   * `true` que já é `true` não dispara efeito nenhum.
   */
  linkRequest?: number;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        h1: e.isActive('heading', { level: 1 }),
        h2: e.isActive('heading', { level: 2 }),
        h3: e.isActive('heading', { level: 3 }),
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        codeBlock: e.isActive('codeBlock'),
        link: e.isActive('link'),
      },
  });

  // Abre por Cmd/Ctrl+K (contador) ou pelo botão de link da barra. `pending`
  // guarda se havia alvo de texto: sem ele, confirmar insere a própria URL
  // como texto do link.
  const [linkDraft, setLinkDraft] = useState<{ url: string; hasTarget: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = linkDraft !== null;

  function openLinkEditor() {
    if (!editor) return;
    const hasTarget = selectLinkTarget(editor);
    setLinkDraft({ url: (editor.getAttributes('link').href as string | undefined) ?? '', hasTarget });
  }

  // Cmd/Ctrl+K. Ignora a montagem (`linkRequest` inicial 0) — o efeito só
  // reage a um pedido de verdade.
  useEffect(() => {
    if (linkRequest > 0) openLinkEditor();
    // `openLinkEditor` lê o editor no momento do disparo; o contador é o gatilho.
  }, [linkRequest]);

  /**
   * Foco no campo assim que ele existe **de verdade** no documento.
   *
   * A bolha do Tiptap posiciona o conteúdo com floating-ui: o React comita o
   * `<input>` antes de o elemento ser inserido na página (medido: o campo só
   * aparece no DOM ~100ms depois da mudança de estado), e `focus()` — inclusive
   * o `autoFocus` do React — não faz nada num nó desconectado. Daí a tentativa
   * quadro a quadro até o campo estar conectado, com teto para nunca virar um
   * laço infinito se a bolha não abrir.
   *
   * Sem isso, o atalho abre o campo mas o que se digita cai no documento — e o
   * `autolink` transforma o endereço em link no meio do texto, que é o oposto
   * do que se pediu.
   */
  useEffect(() => {
    if (!editing) return;
    let frame = 0;
    let attempts = 0;
    const tryFocus = () => {
      const input = inputRef.current;
      if (input && input.isConnected) {
        input.focus({ preventScroll: true });
        input.select();
        return;
      }
      if (attempts++ > 30) return;
      frame = requestAnimationFrame(tryFocus);
    };
    frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  if (!editor || !state) return null;

  const chain = () => editor.chain().focus();

  /**
   * `refocus` só quando o fechamento é uma decisão de teclado (Esc, Cancel,
   * aplicar): aí devolver o cursor ao texto é o que a pessoa espera. Quando o
   * fechamento vem de um clique no documento, refocar brigaria com o clique e
   * jogaria o cursor de volta para a seleção antiga.
   */
  function closeLinkEditor(refocus = true) {
    setLinkDraft(null);
    if (refocus) editor?.commands.focus();
  }

  function applyLink() {
    if (!editor || !linkDraft) return;
    const url = linkDraft.url.trim();
    if (!url) {
      closeLinkEditor();
      return;
    }
    const href = normalizeUrl(url);
    if (linkDraft.hasTarget) {
      chain().extendMarkRange('link').setLink({ href }).run();
    } else {
      // Sem texto em volta do cursor: o próprio endereço vira o texto do link
      // (mesma saída do Google Docs) em vez de aplicar uma marca no vazio, que
      // não deixaria nada visível na página.
      //
      // O texto entra primeiro e a marca vai depois, sobre o trecho recém
      // inserido: passar `marks` direto no `insertContent` **não insere nada**
      // (a marca chega sem `target`/`rel`, que o `extension-link` preenche), e
      // a régua do intervalo é a posição do cursor *depois* da inserção —
      // calcular a partir da anterior erra por um caractere (medido, o último
      // ficava fora do link).
      chain().insertContent(href).run();
      const end = editor.state.selection.from;
      editor
        .chain()
        .setTextSelection({ from: end - href.length, to: end })
        .setLink({ href })
        .focus()
        .run();
    }
    setLinkDraft(null);
  }

  function removeLink() {
    chain().extendMarkRange('link').unsetLink().run();
    setLinkDraft(null);
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 8 }}
      role="toolbar"
      aria-label="Formatting"
      // Enquanto o campo de link está aberto a barra fica visível mesmo sem
      // seleção — Cmd/Ctrl+K com o cursor dentro de um link é um caso legítimo,
      // e a barra sumir no instante em que se clica no campo tornaria o editor
      // de link inalcançável.
      shouldShow={({ editor: e, state: editorState, from, to }) =>
        editing || (e.isEditable && from !== to && !editorState.selection.empty)
      }
      className="sb-bubble-menu flex items-center gap-0.5 rounded-editorial-md border border-border/80 bg-background p-1 shadow-editorial-md"
    >
      {editing ? (
        <form
          className="flex items-center gap-1 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <input
            ref={inputRef}
            // `type="text"` + `inputMode="url"`: o teclado de URL no toque, sem
            // a validação nativa do `type="url"` — ela rejeita "exemplo.com" e
            // **bloqueia o submit em silêncio**, justamente a forma abreviada
            // que o `normalizeUrl` existe para aceitar.
            type="text"
            inputMode="url"
            placeholder="Paste or type a link"
            aria-label="Link address"
            value={linkDraft.url}
            onChange={(event) => setLinkDraft({ ...linkDraft, url: event.target.value })}
            onBlur={(event) => {
              // Clicar de volta no texto (ou em qualquer lugar fora da bolha)
              // fecha o campo. Sem isto ele fica **preso** sobre o documento:
              // o `shouldShow` mantém a barra visível enquanto o campo existe,
              // e só Esc ou Cancel o tirariam da tela. Os botões da própria
              // bolha dão `preventDefault` no mousedown, então não geram blur —
              // aplicar e remover continuam funcionando pelo mouse.
              if (event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) return;
              closeLinkEditor(false);
            }}
            onKeyDown={(event) => {
              // Esc fecha sem aplicar e devolve o cursor ao texto. Fica no
              // input (e não num handler global) porque é aqui que o foco está.
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeLinkEditor();
              }
            }}
            className="border-input h-7 w-56 min-w-0 rounded-editorial-sm border bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <BubbleButton label={<Check />} title="Apply link" onClick={applyLink} />
          {state.link && <BubbleButton label={<Unlink />} title="Remove link" onClick={removeLink} />}
          <BubbleButton label={<X />} title="Cancel" onClick={closeLinkEditor} />
        </form>
      ) : (
        <>
          <BubbleButton
            label={<Heading1 />}
            title="Heading 1"
            active={state.h1}
            onClick={() => chain().toggleHeading({ level: 1 }).run()}
          />
          <BubbleButton
            label={<Heading2 />}
            title="Heading 2"
            active={state.h2}
            onClick={() => chain().toggleHeading({ level: 2 }).run()}
          />
          <BubbleButton
            label={<Heading3 />}
            title="Heading 3"
            active={state.h3}
            onClick={() => chain().toggleHeading({ level: 3 }).run()}
          />
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <BubbleButton
            label={<Bold />}
            title="Bold (Cmd/Ctrl+B)"
            active={state.bold}
            onClick={() => chain().toggleBold().run()}
          />
          <BubbleButton
            label={<Italic />}
            title="Italic (Cmd/Ctrl+I)"
            active={state.italic}
            onClick={() => chain().toggleItalic().run()}
          />
          {/* Sublinhado fecha o trio de ênfase (SYS-77) e fica **antes** do
              link: os três mudam a aparência do mesmo texto, o link muda o que
              ele faz. O atalho `Mod-u` vem da própria extensão. */}
          <BubbleButton
            label={<UnderlineIcon />}
            title="Underline (Cmd/Ctrl+U)"
            active={state.underline}
            onClick={() => chain().toggleUnderline().run()}
          />
          <BubbleButton
            label={<LinkIcon />}
            title={state.link ? 'Edit link (Cmd/Ctrl+K)' : 'Add link (Cmd/Ctrl+K)'}
            active={state.link}
            onClick={openLinkEditor}
          />
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <BubbleButton
            label={<List />}
            title="Bulleted list"
            active={state.bulletList}
            onClick={() => chain().toggleBulletList().run()}
          />
          <BubbleButton
            label={<ListOrdered />}
            title="Numbered list"
            active={state.orderedList}
            onClick={() => chain().toggleOrderedList().run()}
          />
          <BubbleButton
            label={<Code />}
            title="Code block"
            active={state.codeBlock}
            onClick={() => chain().toggleCodeBlock().run()}
          />
        </>
      )}
    </BubbleMenu>
  );
}
