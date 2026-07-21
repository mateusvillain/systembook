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
 * revisões do editor (TASK-35, `RevisionSnapshotPreview`) e a doc pública
 * (TASK-50/52). Aceita seleção de tab **controlada** (`activeTabId`/
 * `onSelectTab`, usada pela doc pública para refletir a tab na URL) ou, se
 * omitida, gerencia a tab ativa internamente.
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

export function PageRenderer({
  snapshot,
  activeTabId: controlledTabId,
  onSelectTab,
}: {
  snapshot: RenderableSnapshot;
  /** Se fornecido, a tab ativa é controlada por quem chama (reflete a URL). */
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
}) {
  const [internalTabId, setInternalTabId] = useState(snapshot.tabs[0]?.tabId);
  const controlled = controlledTabId !== undefined && onSelectTab !== undefined;
  const wantedTabId = controlled ? controlledTabId : internalTabId;

  const activeTab = snapshot.tabs.find((t) => t.tabId === wantedTabId) ?? snapshot.tabs[0];
  if (!activeTab) return <p>Página sem conteúdo.</p>;

  const selectTab = (tabId: string) => {
    if (controlled) onSelectTab(tabId);
    else setInternalTabId(tabId);
  };

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
              onClick={() => selectTab(tab.tabId)}
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
