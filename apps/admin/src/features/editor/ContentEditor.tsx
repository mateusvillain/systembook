import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/core';
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
import { useTRPC } from '../../lib/trpc.js';
import { Callout } from './nodes/Callout.js';
import { ComponentEmbed } from './nodes/ComponentEmbed.js';
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
  Callout,
  ComponentEmbed,
  UndoRedo,
  Dropcursor,
  Gapcursor,
];

const AUTOSAVE_DEBOUNCE_MS = 2000;
const SAVED_LABEL_MS = 2000;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Editor Tiptap de uma tab: carrega o rascunho de blocks.getByTab e persiste
 * via autosave (TASK-31/32). Monte com `key={tabId}` para garantir instância
 * nova ao trocar de tab.
 */
export function ContentEditor({ tabId }: { tabId: string }) {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.blocks.getByTab.queryOptions({ tabId }),
    // Sem cache entre montagens: o rascunho pode ter sido salvo pelo flush do
    // unmount anterior — dados velhos iniciariam o editor com conteúdo antigo.
    gcTime: 0,
  });

  if (query.isPending) return <p>Carregando conteúdo…</p>;
  if (query.isError) return <p role="alert">Erro ao carregar o conteúdo da tab.</p>;

  return <EditorInner tabId={tabId} initialDoc={query.data.doc as JSONContent | null} />;
}

function EditorInner({ tabId, initialDoc }: { tabId: string; initialDoc: JSONContent | null }) {
  const trpc = useTRPC();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const saveDraft = useMutation(trpc.blocks.saveDraft.mutationOptions());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedLabelRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDocRef = useRef<JSONContent | null>(null);

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const doc = pendingDocRef.current;
    if (!doc) return;
    pendingDocRef.current = null;
    saveDraft.mutate(
      // getJSON() devolve JSONContent (type opcional); o input do saveDraft
      // exige o literal 'doc' — na prática o root é sempre 'doc'.
      { tabId, doc: doc as unknown as { type: 'doc'; content?: { type: string }[] } },
      {
        onSuccess: () => {
          // se já digitou de novo enquanto salvava, continua em "Salvando…"
          if (pendingDocRef.current) return;
          setStatus('saved');
          savedLabelRef.current = setTimeout(() => setStatus('idle'), SAVED_LABEL_MS);
        },
        onError: () => setStatus('error'),
      },
    );
  }, [saveDraft, tabId]);

  // onUpdate vive dentro do useEditor (deps [tabId]); o ref evita closure
  // velha de flush sem recriar o editor.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const editor = useEditor(
    {
      extensions,
      content: initialDoc ?? '',
      editorProps: {
        attributes: { 'aria-label': 'Conteúdo da tab', 'data-tab-id': tabId },
      },
      onUpdate: ({ editor: e }) => {
        pendingDocRef.current = e.getJSON();
        setStatus('saving');
        if (savedLabelRef.current) clearTimeout(savedLabelRef.current);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => flushRef.current(), AUTOSAVE_DEBOUNCE_MS);
      },
    },
    [tabId],
  );

  // Flush no unmount: navegação com debounce pendente salva imediatamente
  // (fire-and-forget, decisão da TASK-32) em vez de descartar em silêncio.
  useEffect(() => {
    return () => {
      if (savedLabelRef.current) clearTimeout(savedLabelRef.current);
      if (pendingDocRef.current) flushRef.current();
    };
  }, []);

  useEffect(() => {
    window.systembookEditor = editor;
    return () => {
      window.systembookEditor = null;
    };
  }, [editor]);

  return (
    <div className="sb-editor">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditorToolbar editor={editor} />
        </div>
        <span
          aria-live="polite"
          data-save-status={status}
          style={{
            fontSize: '0.8rem',
            color: status === 'error' ? '#b00020' : '#666',
            whiteSpace: 'nowrap',
            paddingTop: '0.35rem',
          }}
        >
          {status === 'saving' && 'Salvando…'}
          {status === 'saved' && 'Salvo'}
          {status === 'error' && 'Erro ao salvar'}
        </span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
