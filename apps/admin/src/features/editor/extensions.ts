import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { Heading } from '@tiptap/extension-heading';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import { Callout } from './nodes/Callout.js';
import { CodeBlock } from './nodes/CodeBlock.js';
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
 * paragraph, bold/italic/underline, listas, code block, table). Strike,
 * blockquote, horizontal rule etc. ficam de fora até o schema de blocks ser
 * estendido.
 *
 * **Marks não têm coluna própria no banco**: viajam dentro do JSON de conteúdo
 * do bloco, e o serializer do server os trata como opacos (`marks?: unknown[]`
 * em `blocks/serialize.ts`, que só valida tipos de nó top-level). Por isso
 * adicionar um mark aqui não pede migration — mas **tirar** um depois de haver
 * conteúdo salvo com ele apaga a formatação de forma silenciosa (o ProseMirror
 * descarta a marca desconhecida ao carregar e o autosave seguinte grava a
 * perda). Entrar é barato; sair não.
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
  // Sublinhado (SYS-77). Entra no set **compartilhado** de propósito: a doc
  // pública renderiza pelo mesmo `editorExtensions`, e um mark que só existisse
  // na edição sumiria da página publicada — o Tiptap descarta silenciosamente
  // marca que o schema não conhece ao carregar o conteúdo.
  Underline,
  // 'whenNotEditable': no editor o clique só posiciona o cursor (não navega
  // por engano durante a edição); no leitor público (`editable: false`) o
  // clique segue o link normalmente.
  Link.configure({ openOnClick: 'whenNotEditable', autolink: true }),
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
