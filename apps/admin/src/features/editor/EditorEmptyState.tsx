import { adminTypography } from '@/lib/typography';
import { cn } from '@/lib/utils';

/**
 * Empty State do editor (TASK-90, simplificado na TASK-104): quando a
 * tab/página não tem nenhum bloco de conteúdo ainda, mostra uma única linha
 * discreta de texto-placeholder no lugar do editor em branco — sem ícone,
 * card ou botão (`referencia-5.png`). Inserir o primeiro bloco já não precisa
 * de um gatilho dedicado aqui: o "+" da `BlockHandles` (hover) e o "/"
 * (`SlashCommand`, TASK-103) funcionam normalmente sobre o parágrafo vazio.
 */
export function EditorEmptyState() {
  return (
    // contentEditable={false}: o hint não faz parte do documento editável.
    // Mesmo padding do `.sb-editor .ProseMirror` (`.sb-editor-empty-hint` em
    // editor.css) pra a linha cair exatamente sobre a primeira linha vazia.
    <div contentEditable={false} className="sb-editor-empty-hint pointer-events-none absolute inset-0">
      <p className={cn(adminTypography.body, 'text-muted-foreground/70')}>
        Start typing, or type &quot;/&quot; to open the block menu. Markdown works
        (**bold**, # heading, - list).
      </p>
    </div>
  );
}
