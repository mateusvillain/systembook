import { useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Block } from '@systembook/schema';
import { contentExtensions } from '../content/extensions.js';
import { blocksToTiptapDoc } from '../content/blocksToTiptapDoc.js';
import '../content/content.css';

/**
 * Renderer read-only de um `PageSnapshot` (TASK-50). Monta o conjunto de
 * extensões de **conteúdo** (SYS-89, `content/extensions.ts`) com
 * `editable: false` — os mesmos nós e NodeViews do editor, sem nenhum controle
 * de edição: o component-embed mantém o iframe + painel de controles
 * interativo (TASK-47/49), mas não tem como (re)selecionar componente.
 *
 * É a peça de renderização de conteúdo compartilhada entre o preview de
 * revisões do editor (TASK-35, `RevisionSnapshotPreview`) e a doc pública
 * (TASK-50/52). Aceita seleção de tab **controlada** (`activeTabId`/
 * `onSelectTab`, usada pela doc pública para refletir a tab na URL) ou, se
 * omitida, gerencia a tab ativa internamente.
 */

/**
 * Forma estrutural mínima de um snapshot renderizável: o `PageSnapshot` do
 * contrato público e os snapshots que o admin recebe pelo wire (preview de
 * rascunho e de revisões, com blocos ainda `unknown`).
 */
export interface RenderableSnapshot {
  tabs: { tabId: string; titulo: string; isPrimary?: boolean; blocks: unknown[] }[];
}

/**
 * Rótulo padrão da "visão" do corpo da página (a tab primária) no tab bar
 * público. A página pode customizá-lo (`titulo` da tab primária, SYS-117);
 * 'Conteúdo' é o valor legado gravado antes disso, nunca exibido.
 */
export const BODY_VIEW_LABEL = 'Overview';

export function bodyViewLabel(titulo: string | undefined): string {
  const t = titulo?.trim();
  return t && t !== 'Conteúdo' ? t : BODY_VIEW_LABEL;
}

function TabContent({ blocks }: { blocks: unknown[] }) {
  const editor = useEditor(
    {
      extensions: contentExtensions,
      // Cast: snapshots do admin chegam pelo wire com os campos `unknown` dos
      // blocos opcionais (nota em `lib/trpc.ts` do admin), mas a forma real bate com
      // `Block[]`, garantida pelo par tiptapDocToBlocks/blocksToTiptapDoc do
      // server.
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

  // Visões do tab bar: Corpo primeiro, depois as tabs de usuário.
  const views = [
    ...(primary ? [{ tabId: primary.tabId, titulo: bodyViewLabel(primary.titulo), blocks: primary.blocks }] : []),
    ...userTabs.map((t) => ({ tabId: t.tabId, titulo: t.titulo, blocks: t.blocks })),
  ];

  const [internalTabId, setInternalTabId] = useState(views[0]?.tabId);
  const controlled = controlledTabId !== undefined && onSelectTab !== undefined;
  const wantedTabId = controlled ? controlledTabId : internalTabId;

  const activeView = views.find((v) => v.tabId === wantedTabId) ?? views[0];
  const tablistRef = useRef<HTMLDivElement>(null);
  if (!activeView) return <p>Page has no content.</p>;

  const selectTab = (tabId: string) => {
    if (controlled) onSelectTab(tabId);
    else setInternalTabId(tabId);
  };

  // Padrão WAI-ARIA de tabs: setas movem o foco (com wrap) e já ativam a
  // tab alvo; Home/End vão pros extremos. Tab/Shift+Tab saem da tablist
  // normalmente (tabIndex em rodízio: só a tab ativa é focável via Tab).
  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    if (e.key === 'ArrowLeft') nextIndex = (index - 1 + views.length) % views.length;
    else if (e.key === 'ArrowRight') nextIndex = (index + 1) % views.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = views.length - 1;
    else return;

    e.preventDefault();
    const nextView = views[nextIndex];
    if (!nextView) return;
    tablistRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [nextIndex]?.focus();
    selectTab(nextView.tabId);
  }

  return (
    <div>
      {/* Tab bar só quando há mais de uma visão (corpo + ≥1 tab de usuário, ou
          múltiplas tabs em snapshots antigos). Página só-corpo não mostra bar. */}
      {views.length > 1 && (
        <div className="sb-tabbar" role="tablist" aria-label="Page views" ref={tablistRef}>
          {views.map((view, index) => (
            <button
              key={view.tabId}
              type="button"
              role="tab"
              id={`sb-tab-${view.tabId}`}
              aria-selected={view.tabId === activeView.tabId}
              tabIndex={view.tabId === activeView.tabId ? 0 : -1}
              className={`sb-tab${view.tabId === activeView.tabId ? ' active' : ''}`}
              onClick={() => selectTab(view.tabId)}
              onKeyDown={(e) => onTabKeyDown(e, index)}
            >
              {view.titulo}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" aria-labelledby={`sb-tab-${activeView.tabId}`}>
        <TabContent key={activeView.tabId} blocks={activeView.blocks} />
      </div>
    </div>
  );
}
