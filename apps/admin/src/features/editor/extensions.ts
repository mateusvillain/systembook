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
  TableHeader,
  TableCell,
  Callout,
  ComponentEmbed,
  UndoRedo,
  Dropcursor,
  Gapcursor,
];
