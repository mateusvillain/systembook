import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import {
  BLOCK_GROUPS,
  filterBlockGroupsForContext,
  getBlockInsertContext,
} from './blockInsert.js';
import { SlashMenu, type SlashMenuEntry, type SlashMenuHandle } from './SlashMenu.js';

export interface SlashCommandOptions {
  /** Chamado quando o item "Component embed" é escolhido — abre o picker próprio (TASK-88). */
  onRequestEmbed: (atPos: number) => void;
}

/**
 * Menu "/" de inserção de blocos (TASK-103): mesma fonte única `BLOCK_GROUPS`
 * do "+" (`BlockHandles`) e do empty state, mas ancorado no cursor via
 * `Suggestion` (util oficial do Tiptap) em vez de um dropdown fixo. A posição
 * de disparo já é a posição real do cursor — diferente do "+" da
 * `BlockHandles`, que sempre insere como irmão do bloco top-level sob o
 * mouse — então o filtro de nesting (TASK-101) pode de fato esconder
 * "Table"/"…callout" quando o "/" é digitado dentro de um callout/célula.
 *
 * Fábrica (não uma instância única compartilhada) porque precisa de um
 * callback do componente React (`onRequestEmbed`) pra abrir o
 * `ComponentEmbedPicker` — esse item não insere direto como os outros.
 */
export function createSlashCommandExtension({ onRequestEmbed }: SlashCommandOptions) {
  return Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
      const editor = this.editor;

      return [
        Suggestion<SlashMenuEntry, SlashMenuEntry>({
          editor,
          char: '/',

          items: ({ query }) => {
            const pos = editor.state.selection.from;
            const context = getBlockInsertContext(editor, pos);
            const groups = filterBlockGroupsForContext(BLOCK_GROUPS, context);
            const flat: SlashMenuEntry[] = groups.flatMap((group) =>
              group.items.map((item) => ({ groupLabel: group.label, item })),
            );
            const q = query.trim().toLowerCase();
            if (!q) return flat;
            return flat.filter((entry) => entry.item.label.toLowerCase().includes(q));
          },

          command: ({ editor: ed, range, props: entry }) => {
            ed.chain().focus().deleteRange(range).run();
            if (entry.item.kind === 'embed') {
              onRequestEmbed(range.from);
              return;
            }
            entry.item.insert?.(ed, range.from);
          },

          render: () => {
            let component: ReactRenderer<SlashMenuHandle, SuggestionProps<SlashMenuEntry, SlashMenuEntry>> | undefined;
            let unmount: (() => void) | undefined;

            return {
              onStart: (props) => {
                component = new ReactRenderer(SlashMenu, { props, editor: props.editor });
                unmount = props.mount(component.element);
              },
              onUpdate: (props) => {
                component?.updateProps(props);
              },
              onKeyDown: (props) => component?.ref?.onKeyDown(props) ?? false,
              onExit: () => {
                unmount?.();
                component?.destroy();
              },
            };
          },
        }),
      ];
    },
  });
}
