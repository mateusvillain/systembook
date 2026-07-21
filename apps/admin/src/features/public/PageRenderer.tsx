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
  tabs: { tabId: string; titulo: string; isPrimary?: boolean; blocks: unknown[] }[];
}

/** Rótulo da "visão" do corpo da página (a tab primária) no tab bar público. */
export const BODY_VIEW_LABEL = 'Visão geral';

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
  // Separa o corpo (tab primária) das tabs de usuário. Snapshots antigos
  // (pré-TASK-66) não têm `isPrimary` — nesse caso não há corpo distinto e
  // todas as entradas são tratadas como tabs (comportamento original).
  const primary = snapshot.tabs.find((t) => t.isPrimary);
  const userTabs = primary ? snapshot.tabs.filter((t) => !t.isPrimary) : snapshot.tabs;

  // Visões do tab bar: "Visão geral" (corpo) primeiro, depois as tabs de usuário.
  const views = [
    ...(primary ? [{ tabId: primary.tabId, titulo: BODY_VIEW_LABEL, blocks: primary.blocks }] : []),
    ...userTabs.map((t) => ({ tabId: t.tabId, titulo: t.titulo, blocks: t.blocks })),
  ];

  const [internalTabId, setInternalTabId] = useState(views[0]?.tabId);
  const controlled = controlledTabId !== undefined && onSelectTab !== undefined;
  const wantedTabId = controlled ? controlledTabId : internalTabId;

  const activeView = views.find((v) => v.tabId === wantedTabId) ?? views[0];
  if (!activeView) return <p>Página sem conteúdo.</p>;

  const selectTab = (tabId: string) => {
    if (controlled) onSelectTab(tabId);
    else setInternalTabId(tabId);
  };

  return (
    <div>
      {/* Tab bar só quando há mais de uma visão (corpo + ≥1 tab de usuário, ou
          múltiplas tabs em snapshots antigos). Página só-corpo não mostra bar. */}
      {views.length > 1 && (
        <div role="tablist" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {views.map((view) => (
            <button
              key={view.tabId}
              type="button"
              role="tab"
              aria-selected={view.tabId === activeView.tabId}
              onClick={() => selectTab(view.tabId)}
              style={{
                padding: '0.35rem 0.75rem',
                border: '1px solid #ccc',
                background: view.tabId === activeView.tabId ? '#eef4ff' : 'white',
                cursor: 'pointer',
              }}
            >
              {view.titulo}
            </button>
          ))}
        </div>
      )}
      <TabContent key={activeView.tabId} blocks={activeView.blocks} />
    </div>
  );
}
