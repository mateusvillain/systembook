import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
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
import { EditorToolbar } from './EditorToolbar.js';
import './editor.css';

declare global {
  interface Window {
    /** Instância ativa do editor, exposta para automação/E2E (ex.: getJSON()). */
    systembookEditor?: Editor | null;
  }
}

/**
 * Conjunto intencional de extensões do MVP (TASK-25/26/27) — sem StarterKit de
 * propósito: o set de nodes/marks espelha os tipos de bloco do PRD (heading,
 * paragraph, bold/italic, listas, code block, table). Strike, blockquote,
 * horizontal rule etc. ficam de fora até o schema de blocks ser estendido.
 */
const extensions = [
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
  UndoRedo,
  Dropcursor,
  Gapcursor,
];

/**
 * Editor Tiptap de uma tab. O conteúdo ainda não é persistido — autosave e
 * blocks chegam nas TASK-31/32. Monte com `key={tabId}` para garantir uma
 * instância nova (e destruição da anterior) ao trocar de tab.
 */
export function ContentEditor({ tabId }: { tabId: string }) {
  const editor = useEditor(
    {
      extensions,
      content: '',
      editorProps: {
        attributes: { 'aria-label': 'Conteúdo da tab', 'data-tab-id': tabId },
      },
    },
    [tabId],
  );

  useEffect(() => {
    window.systembookEditor = editor;
    return () => {
      window.systembookEditor = null;
    };
  }, [editor]);

  return (
    <div className="sb-editor">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
