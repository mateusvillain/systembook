import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import {
  BLOCK_GROUPS,
  filterBlockGroupsForContext,
  getBlockInsertContext,
} from './blockInsert.js';
import { SlashMenu, type SlashMenuEntry, type SlashMenuHandle } from './SlashMenu.js';
import type { Translator } from '@systembook/docs-site';
import type { AdminMessageKey } from '@/i18n/messages/en';

export interface SlashCommandOptions {
  /** Chamado quando o item "Component embed" é escolhido — abre o picker próprio (TASK-88). */
  onRequestEmbed: (atPos: number) => void;
  /**
   * Tradutor no idioma ativo, lido a cada digitação (SYS-182): a extensão vive
   * enquanto o editor vive, e o idioma pode mudar nesse meio-tempo.
   */
  getTranslator: () => Translator<AdminMessageKey>;
}

/** Minúsculas e sem acento: "titulo" acha "Título". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
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
export function createSlashCommandExtension({ onRequestEmbed, getTranslator }: SlashCommandOptions) {
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
            const q = normalize(query.trim());
            if (!q) return flat;
            // Casa o rótulo no idioma ativo — o que a pessoa está vendo no menu.
            const t = getTranslator();
            return flat.filter((entry) => normalize(t(entry.item.label)).includes(q));
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
