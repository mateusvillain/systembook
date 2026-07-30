import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Moon, Sun, X } from 'lucide-react';
import { useTRPC } from '../../lib/trpc.js';
import { PageRenderer, type RenderableSnapshot } from '../public/PageRenderer.js';
import { TableOfContents } from '../public/TableOfContents.js';
import { useHeadingIds } from '../public/useHeadingIds.js';
import { useTheme } from '../public/useTheme.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import '../public/public.css';

/**
 * Preview do rascunho (SYS-58): mostra a página **como o leitor a veria** se
 * fosse publicada agora, a partir de `pages.getDraftPreview` (SYS-57).
 *
 * **Por que dialog em tela cheia e não uma nova aba.** O critério da issue é
 * que o preview reflita o autosave mais recente, e a única forma de garantir
 * isso é dar `flush()` no editor **antes** de buscar o conteúdo (quem chama faz
 * isso). Abrir uma aba depois de um `await` é justamente o caso que os
 * bloqueadores de popup barram, e uma aba aberta *antes* do flush correria com
 * ele — leria o rascunho velho. O dialog também mantém a continuidade espacial:
 * Esc devolve o editor exatamente onde estava, sem perder o cursor.
 *
 * **Fidelidade.** Nada aqui redesenha o conteúdo: é o mesmo `PageRenderer` da
 * doc pública dentro do mesmo cartão (`.sb-public` → `.sb-public-content` →
 * `.sb-page-grid`), com o mesmo TOC lateral e o mesmo par de temas. O que fica
 * de fora é só o chrome de navegação da instância (sidebar, top nav, busca) —
 * ele não muda com o conteúdo desta página e ocuparia a largura que interessa
 * conferir.
 */
export function DraftPreviewDialog({
  pageId,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  pageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Elemento que recebe o foco ao fechar — o botão que abriu o preview.
   * Explícito porque o dialog é aberto por código (o gatilho precisa dar
   * `flush()` no editor antes), não por um `DialogTrigger`: a devolução
   * automática do Radix parte do que estava focado na montagem, e um clique de
   * mouse num `<button>` nem sempre deixa foco atrás de si. Sem isto, fechar o
   * preview joga o teclado de volta no `<body>`, no topo da página.
   */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
        // Tela cheia, sem cartão centrado: a largura de leitura da doc pública
        // (640px) só é conferível se o preview tiver a mesma área que ela.
        //
        // `w-screen` (100vw) e não o `right: 0` do `inset-0`: o painel usa
        // `scrollbar-gutter: stable` no `html`, então o bloco contentor de um
        // elemento `fixed` exclui a calha reservada — com `inset-0` sobrava uma
        // faixa de ~15px do editor aparecendo à direita do preview (gritante no
        // tema escuro, onde a faixa é branca).
        //
        // Só fade, sem o `zoom-95` do dialog padrão: numa superfície do
        // tamanho da tela o zoom vira a tela inteira pulsando, e o que a
        // animação precisa dizer aqui ("outra camada por cima") o fade já diz.
        className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
        aria-describedby="draft-preview-description"
      >
        {open && <PreviewBody pageId={pageId} />}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ pageId }: { pageId: string }) {
  const trpc = useTRPC();
  const { theme, toggle } = useTheme();
  const bodyRef = useRef<HTMLElement>(null);

  const query = useQuery({
    ...trpc.pages.getDraftPreview.queryOptions({ pageId }),
    // O rascunho muda a cada tecla: cache quente aqui mostraria o conteúdo de
    // uma abertura anterior. `staleTime: 0` + `gcTime: 0` fazem cada abertura
    // buscar de novo, e o corpo só é renderizado quando a busca termina (ver
    // abaixo) — nunca há um piscar do conteúdo antigo.
    staleTime: 0,
    gcTime: 0,
  });

  const { items, headings } = useHeadingIds(bodyRef, `${pageId}/${query.dataUpdatedAt}`);

  // O TOC navega por hash (`history.replaceState`), o que é o comportamento
  // certo na doc pública mas deixaria um `#secao` colado na URL do editor
  // depois de fechar. Limpa na desmontagem — sem entrada no histórico, como o
  // próprio TOC faz.
  useEffect(() => {
    return () => {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
  }, []);

  const dark = theme === 'dark';

  return (
    <>
      <header className="bg-background flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Eye className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <DialogTitle className="shrink-0">Draft preview</DialogTitle>
          {/* Estado dito por texto, não por cor: o aviso de "isto não é o que
              está no ar" não pode depender de distinguir um tom de fundo. */}
          <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-xs">
            Not published
          </span>
          {/* O título só existe aqui como orientação em telas largas: ele é a
              primeira coisa dentro do próprio preview, e no mobile disputava a
              barra com os botões, sobrando truncado numa letra só. */}
          {query.data && (
            <p className="text-muted-foreground hidden min-w-0 truncate text-sm md:block">
              {query.data.titulo}
            </p>
          )}
        </div>

        {/* Alvos de 44px no toque (`min-h-11`), 32px no ponteiro: os dois
            controles da barra são pequenos e ficam colados no canto — o mais
            fácil de errar com o polegar. */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 sm:min-h-8"
            onClick={toggle}
            aria-pressed={dark}
            aria-label={dark ? 'Switch preview to light theme' : 'Switch preview to dark theme'}
          >
            {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
          </Button>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 sm:min-h-8"
              aria-label="Close preview"
            >
              <X className="size-4" aria-hidden />
              <span className="hidden sm:inline">Close</span>
              <kbd className="text-muted-foreground/80 hidden rounded border px-1 text-[11px] sm:inline">
                Esc
              </kbd>
            </Button>
          </DialogClose>
        </div>
      </header>

      <DialogDescription id="draft-preview-description" className="sr-only">
        Read-only rendering of this page&apos;s current draft, including your latest edits. Nothing
        here is published until you publish the page.
      </DialogDescription>

      {/* `sb-public--preview` desarma o shell de página inteira (grid de
          sidebar + 100dvh) e deixa o cartão preencher o que sobra do dialog. */}
      <div className="sb-public sb-public--preview" data-theme={theme}>
        {query.isPending || query.isFetching ? (
          <PreviewMessage>Loading preview…</PreviewMessage>
        ) : query.isError ? (
          <PreviewMessage role="alert">
            Could not load the preview. Close and try again.
          </PreviewMessage>
        ) : (
          <main className="sb-public-content">
            <div className="sb-public-content-inner">
              <div className="sb-page-grid">
                <article className="sb-page-body" ref={bodyRef}>
                  <header className="sb-page-header">
                    <h1 className="sb-public-title">{query.data.titulo}</h1>
                    {query.data.subtitulo && (
                      <p className="sb-page-subtitle">{query.data.subtitulo}</p>
                    )}
                  </header>
                  <PageRenderer snapshot={query.data.snapshot as RenderableSnapshot} />
                </article>
                <aside className="sb-page-toc">
                  <TableOfContents items={items} headings={headings} />
                </aside>
              </div>
            </div>
          </main>
        )}
      </div>
    </>
  );
}

/** Mensagem de estado ocupando o lugar do cartão, para o layout não saltar. */
function PreviewMessage({ children, role }: { children: React.ReactNode; role?: 'alert' }) {
  return (
    <main className="sb-public-content">
      <div className="sb-public-content-inner">
        <p role={role} style={{ color: 'var(--sb-fg-muted)' }}>
          {children}
        </p>
      </div>
    </main>
  );
}
