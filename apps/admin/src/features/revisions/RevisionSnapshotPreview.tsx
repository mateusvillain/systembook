import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Block } from '@systembook/schema';
import type { RouterOutput } from '../../lib/trpc.js';
import { editorExtensions } from '../editor/extensions.js';
import { blocksToTiptapDoc } from './blocksToTiptapDoc.js';
import '../editor/editor.css';

type PageSnapshot = RouterOutput['revisions']['getById']['snapshot'];

/** Uma tab do snapshot renderizada como Tiptap não-editável (TASK-35). */
function TabSnapshotPreview({ blocks }: { blocks: PageSnapshot['tabs'][number]['blocks'] }) {
  const editor = useEditor(
    {
      extensions: editorExtensions,
      // Cast: o output de query "como chega pelo wire" marca campos `unknown`
      // como opcionais (ver nota em lib/trpc.ts), mas a forma real bate com
      // `Block[]` — controlada pelo `blocksToTiptapDoc`/`tiptapDocToBlocks`
      // do server (TASK-31).
      content: blocksToTiptapDoc(blocks as Block[]),
      editable: false,
    },
    [blocks],
  );

  return (
    <div className="sb-editor">
      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * Preview read-only de um `PageSnapshot` completo (todas as tabs da revisão
 * selecionada), com um seletor simples de tab. Reaproveita o mesmo set de
 * extensões Tiptap do editor (TASK-25+) em vez de um renderer de blocks à
 * parte — nota técnica da TASK-35.
 */
export function RevisionSnapshotPreview({ snapshot }: { snapshot: PageSnapshot }) {
  const [activeTabId, setActiveTabId] = useState(snapshot.tabs[0]?.tabId);
  const activeTab = snapshot.tabs.find((t) => t.tabId === activeTabId) ?? snapshot.tabs[0];

  if (!activeTab) return <p>Snapshot sem tabs.</p>;

  return (
    <div>
      <div role="tablist" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {snapshot.tabs.map((tab) => (
          <button
            key={tab.tabId}
            type="button"
            role="tab"
            aria-selected={tab.tabId === activeTab.tabId}
            onClick={() => setActiveTabId(tab.tabId)}
            style={{
              padding: '0.35rem 0.75rem',
              border: '1px solid #ccc',
              background: tab.tabId === activeTab.tabId ? '#eef4ff' : 'white',
              cursor: 'pointer',
            }}
          >
            {tab.titulo}
          </button>
        ))}
      </div>
      <TabSnapshotPreview key={activeTab.tabId} blocks={activeTab.blocks} />
    </div>
  );
}
