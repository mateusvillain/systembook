import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useTRPC } from '../../lib/trpc.js';
import { editorExtensions as extensions } from './extensions.js';
import { EditorToolbar } from './EditorToolbar.js';
import './editor.css';

declare global {
  interface Window {
    /** Instância ativa do editor, exposta para automação/E2E (ex.: getJSON()). */
    systembookEditor?: Editor | null;
  }
}

const AUTOSAVE_DEBOUNCE_MS = 2000;
const SAVED_LABEL_MS = 2000;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Exposto via ref para quem precisa garantir que o rascunho está salvo antes de agir (ex.: Publicar, TASK-34). */
export interface ContentEditorHandle {
  /** Força o flush do autosave pendente (se houver) e aguarda o saveDraft terminar. */
  flush: () => Promise<void>;
}

/**
 * Editor Tiptap de uma tab: carrega o rascunho de blocks.getByTab e persiste
 * via autosave (TASK-31/32). Monte com `key={tabId}` para garantir instância
 * nova ao trocar de tab.
 */
export const ContentEditor = forwardRef<ContentEditorHandle, { tabId: string }>(function ContentEditor(
  { tabId },
  ref,
) {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.blocks.getByTab.queryOptions({ tabId }),
    // Sem cache entre montagens: o rascunho pode ter sido salvo pelo flush do
    // unmount anterior — dados velhos iniciariam o editor com conteúdo antigo.
    gcTime: 0,
  });

  if (query.isPending) return <p>Carregando conteúdo…</p>;
  if (query.isError) return <p role="alert">Erro ao carregar o conteúdo da tab.</p>;

  return <EditorInner ref={ref} tabId={tabId} initialDoc={query.data.doc as JSONContent | null} />;
});

const EditorInner = forwardRef<ContentEditorHandle, { tabId: string; initialDoc: JSONContent | null }>(
  function EditorInner({ tabId, initialDoc }, ref) {
    const trpc = useTRPC();
    const [status, setStatus] = useState<SaveStatus>('idle');
    const saveDraft = useMutation(trpc.blocks.saveDraft.mutationOptions());

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedLabelRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingDocRef = useRef<JSONContent | null>(null);

    const flush = useCallback(async () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const doc = pendingDocRef.current;
      if (!doc) return;
      pendingDocRef.current = null;
      setStatus('saving');
      try {
        await saveDraft.mutateAsync(
          // getJSON() devolve JSONContent (type opcional); o input do saveDraft
          // exige o literal 'doc' — na prática o root é sempre 'doc'.
          { tabId, doc: doc as unknown as { type: 'doc'; content?: { type: string }[] } },
        );
        // se já digitou de novo enquanto salvava, continua em "Salvando…"
        if (pendingDocRef.current) return;
        setStatus('saved');
        savedLabelRef.current = setTimeout(() => setStatus('idle'), SAVED_LABEL_MS);
      } catch {
        setStatus('error');
      }
    }, [saveDraft, tabId]);

    // onUpdate vive dentro do useEditor (deps [tabId]); o ref evita closure
    // velha de flush sem recriar o editor.
    const flushRef = useRef(flush);
    flushRef.current = flush;

    useImperativeHandle(ref, () => ({ flush }), [flush]);

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
  },
);
