import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Heading } from '@tiptap/extension-heading';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import { Callout } from './nodes/Callout.js';
import { ComponentEmbed } from './nodes/ComponentEmbed.js';
import { DosDonts } from './nodes/DosDonts.js';

/**
 * Conteúdo de célula de tabela (TASK-101): enumera os blocos permitidos em vez
 * do `'block+'` padrão do `@tiptap/extension-table` — exclui `table` (tabela
 * aninhada) e `callout` (o `TableControls`/estilo de borda do callout não
 * combinam com o layout de célula), mantendo texto, listas, código, dos-donts
 * e embed de componente.
 */
const TABLE_CELL_CONTENT = '(paragraph | heading | bulletList | orderedList | codeBlock | dosDonts | componentEmbed)+';

/**
 * Conjunto intencional de extensões do MVP (TASK-25/26/27) — sem StarterKit de
 * propósito: o set de nodes/marks espelha os tipos de bloco do PRD (heading,
 * paragraph, bold/italic, listas, code block, table). Strike, blockquote,
 * horizontal rule etc. ficam de fora até o schema de blocks ser estendido.
 *
 * Compartilhado entre o `ContentEditor` (edição) e o preview read-only de
 * revisões (TASK-35, `editable: false`) — mesmo modelo de conteúdo nos dois.
 */
export const editorExtensions = [
  Document,
  Paragraph,
  Text,
  Heading.configure({ levels: [1, 2, 3] }),
  Bold,
  Italic,
  BulletList,
  OrderedList,
  ListItem,
  CodeBlock,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader.extend({ content: TABLE_CELL_CONTENT }),
  TableCell.extend({ content: TABLE_CELL_CONTENT }),
  Callout,
  ComponentEmbed,
  DosDonts,
  UndoRedo,
  Dropcursor,
  Gapcursor,
];
