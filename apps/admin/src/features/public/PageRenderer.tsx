import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Block } from '@systembook/schema';
import { editorExtensions } from '../editor/extensions.js';
import { blocksToTiptapDoc } from '../revisions/blocksToTiptapDoc.js';
import '../editor/editor.css';

/**
 * Renderer read-only de um `PageSnapshot` (TASK-50). Reaproveita o mesmo set de
 * extensões Tiptap do editor (TASK-25+) montado com `editable: false` — os
 * NodeViews React (callout, component-embed) renderizam igual, e o
 * component-embed detecta o modo read-only para esconder a (re)seleção
 * mantendo o iframe + painel de controles interativo (TASK-47/49).
 *
 * É a peça de renderização de conteúdo compartilhada entre o preview de
 * revisões do editor (TASK-35, `RevisionSnapshotPreview`) e a doc pública.
 * O chrome de layout público (nav/busca/tema) vem na Fase 6 (TASK-52+).
 */

/** Forma estrutural comum aos snapshots vindos das queries de revisão. */
export interface RenderableSnapshot {
  tabs: { tabId: string; titulo: string; blocks: unknown[] }[];
}

function TabContent({ blocks }: { blocks: unknown[] }) {
  const editor = useEditor(
    {
      extensions: editorExtensions,
      // Cast: o output "como chega pelo wire" marca campos `unknown` como
      // opcionais (nota em lib/trpc.ts), mas a forma real bate com `Block[]`,
      // garantida pelo par tiptapDocToBlocks/blocksToTiptapDoc do server.
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

export function PageRenderer({ snapshot }: { snapshot: RenderableSnapshot }) {
  const [activeTabId, setActiveTabId] = useState(snapshot.tabs[0]?.tabId);
  const activeTab = snapshot.tabs.find((t) => t.tabId === activeTabId) ?? snapshot.tabs[0];

  if (!activeTab) return <p>Página sem conteúdo.</p>;

  return (
    <div>
      {snapshot.tabs.length > 1 && (
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
      )}
      <TabContent key={activeTab.tabId} blocks={activeTab.blocks} />
    </div>
  );
}
