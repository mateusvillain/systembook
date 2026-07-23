import type { Editor } from '@tiptap/react';
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Info,
  Lightbulb,
  List,
  ListOrdered,
  Pilcrow,
  Puzzle,
  Table as TableIcon,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { CalloutVariant, DosDontsVariant } from '@systembook/schema';

/**
 * Registro único de blocos inseríveis (TASK-88). É a **fonte única** da inserção
 * de blocos — consumido pelo picker do controle inline "+" (`BlockHandles`). O
 * antigo caminho de inserção da top toolbar (TASK-79) foi aposentado para não
 * existirem dois caminhos de inserção divergentes; a toolbar guarda só a
 * formatação da linha atual (marcas, toggles de heading/lista/código) e os
 * controles contextuais de tabela.
 *
 * Cada item sabe se inserir num ponto explícito do documento (`atPos`, o fim do
 * bloco sob o cursor) reusando a mesma lógica de posicionamento de caret que a
 * toolbar usava para callout/dos-donts.
 */

export interface BlockItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Insere o bloco. `atPos` = posição (fim do bloco atual) para inserir logo abaixo. */
  insert?: (editor: Editor, atPos: number) => void;
  /** Blocos que abrem um seletor próprio antes de inserir (ex.: embed de componente). */
  kind?: 'embed';
}

export interface BlockGroup {
  label: string;
  items: BlockItem[];
}

/**
 * Posiciona o caret dentro do parágrafo inicial de um node-wrapper recém-inserido
 * em `nodePos`. O NodeView React monta assíncrono e o `selectionToDOM` do
 * ProseMirror não reposiciona o caret do DOM dentro dele — sem isto a digitação
 * seguiria o caret antigo, fora do node (mesma armadilha da TASK-32). Reposiciona
 * o Range manualmente assim que o `contentDOM` existir.
 */
function placeCaretInside(editor: Editor, nodePos: number, contentSelector: string) {
  // +2: entra no node (+1) e no parágrafo inicial (+1).
  const pos = nodePos + 2;
  editor.chain().setTextSelection(pos).run();
  const placeCaret = (attempt: number) => {
    if (editor.isDestroyed) return;
    const { node, offset } = editor.view.domAtPos(pos);
    const element = node instanceof Element ? node : node.parentElement;
    if (!element?.closest(contentSelector)) {
      if (attempt < 10) requestAnimationFrame(() => placeCaret(attempt + 1));
      return;
    }
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.view.focus();
  };
  requestAnimationFrame(() => placeCaret(0));
}

/** Insere um node-wrapper (callout/dos-donts) em `atPos` com o caret dentro. */
function insertWrapper(
  editor: Editor,
  atPos: number,
  nodeType: string,
  attrs: Record<string, unknown>,
  contentSelector: string,
) {
  editor
    .chain()
    .focus()
    .insertContentAt(atPos, { type: nodeType, attrs, content: [{ type: 'paragraph' }] })
    .run();
  // O node inserido começa exatamente em atPos.
  placeCaretInside(editor, atPos, contentSelector);
}

/** Insere conteúdo simples em `atPos` e deixa o Tiptap posicionar a seleção. */
function insertSimple(editor: Editor, atPos: number, content: Record<string, unknown>) {
  editor.chain().focus().insertContentAt(atPos, content).run();
}

function tableContent(rows: number, cols: number) {
  const cell = (header: boolean) => ({
    type: header ? 'tableHeader' : 'tableCell',
    content: [{ type: 'paragraph' }],
  });
  const row = (header: boolean) => ({
    type: 'tableRow',
    content: Array.from({ length: cols }, () => cell(header)),
  });
  return {
    type: 'table',
    content: [row(true), ...Array.from({ length: rows - 1 }, () => row(false))],
  };
}

const CALLOUT_VARIANT_META: Record<CalloutVariant, { label: string; icon: LucideIcon }> = {
  info: { label: 'Alerta informativo', icon: Info },
  warning: { label: 'Alerta de aviso', icon: TriangleAlert },
  tip: { label: 'Alerta de dica', icon: Lightbulb },
};

const DOS_DONTS_VARIANT_META: Record<DosDontsVariant, { label: string; icon: LucideIcon }> = {
  do: { label: 'Bloco Do (recomendado)', icon: ThumbsUp },
  dont: { label: "Bloco Don't (evitar)", icon: ThumbsDown },
};

export const BLOCK_GROUPS: BlockGroup[] = [
  {
    label: 'Texto',
    items: [
      {
        id: 'paragraph',
        label: 'Parágrafo',
        icon: Pilcrow,
        insert: (editor, atPos) => insertSimple(editor, atPos, { type: 'paragraph' }),
      },
      {
        id: 'codeBlock',
        label: 'Bloco de código',
        icon: Code,
        insert: (editor, atPos) => insertSimple(editor, atPos, { type: 'codeBlock' }),
      },
    ],
  },
  {
    label: 'Títulos',
    items: [
      {
        id: 'h1',
        label: 'Título 1',
        icon: Heading1,
        insert: (editor, atPos) => insertSimple(editor, atPos, { type: 'heading', attrs: { level: 1 } }),
      },
      {
        id: 'h2',
        label: 'Título 2',
        icon: Heading2,
        insert: (editor, atPos) => insertSimple(editor, atPos, { type: 'heading', attrs: { level: 2 } }),
      },
      {
        id: 'h3',
        label: 'Título 3',
        icon: Heading3,
        insert: (editor, atPos) => insertSimple(editor, atPos, { type: 'heading', attrs: { level: 3 } }),
      },
    ],
  },
  {
    label: 'Listas',
    items: [
      {
        id: 'bulletList',
        label: 'Lista com marcadores',
        icon: List,
        insert: (editor, atPos) =>
          insertSimple(editor, atPos, {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
          }),
      },
      {
        id: 'orderedList',
        label: 'Lista numerada',
        icon: ListOrdered,
        insert: (editor, atPos) =>
          insertSimple(editor, atPos, {
            type: 'orderedList',
            content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
          }),
      },
    ],
  },
  {
    label: 'Blocos',
    items: [
      {
        id: 'table',
        label: 'Tabela',
        icon: TableIcon,
        insert: (editor, atPos) => insertSimple(editor, atPos, tableContent(3, 3)),
      },
      ...(Object.keys(CALLOUT_VARIANT_META) as CalloutVariant[]).map(
        (variant): BlockItem => ({
          id: `callout-${variant}`,
          label: CALLOUT_VARIANT_META[variant].label,
          icon: CALLOUT_VARIANT_META[variant].icon,
          insert: (editor, atPos) =>
            insertWrapper(editor, atPos, 'callout', { variant }, '.sb-callout-content'),
        }),
      ),
      ...(Object.keys(DOS_DONTS_VARIANT_META) as DosDontsVariant[]).map(
        (variant): BlockItem => ({
          id: `dosDonts-${variant}`,
          label: DOS_DONTS_VARIANT_META[variant].label,
          icon: DOS_DONTS_VARIANT_META[variant].icon,
          insert: (editor, atPos) =>
            insertWrapper(
              editor,
              atPos,
              'dosDonts',
              { variant, titulo: '', cover: null },
              '.sb-dos-donts-content',
            ),
        }),
      ),
      {
        id: 'componentEmbed',
        label: 'Embed de componente',
        icon: Puzzle,
        kind: 'embed',
      },
    ],
  },
];

/** Insere o embed de componente em `atPos` (após o `ComponentEmbedPicker` confirmar). */
export function insertComponentEmbed(
  editor: Editor,
  atPos: number,
  selection: { componentName: string; variantId: string | null },
) {
  insertSimple(editor, atPos, {
    type: 'componentEmbed',
    attrs: { componentName: selection.componentName, variantId: selection.variantId },
  });
}
