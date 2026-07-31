import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface LinkShortcutOptions {
  /** Abre o editor de link da bolha de formatação (React). */
  onRequestLink: () => void;
}

/**
 * Cmd/Ctrl+K → editor de link (SYS-65).
 *
 * O `@tiptap/extension-link` traz os comandos (`setLink`/`unsetLink`) mas
 * nenhum atalho: só quem tem a UI sabe o que "abrir o link" significa. Daí a
 * **fábrica** com callback, mesmo padrão do `createSlashCommandExtension`
 * (TASK-103) — a extensão é montada por instância no `ContentEditor`, e o
 * renderer read-only da doc pública, que importa `editorExtensions` puro,
 * nunca a recebe.
 *
 * **Por que um plugin com `handleKeyDown` e não `addKeyboardShortcuts`.** O
 * painel já tem um dono para ⌘K: a paleta de busca (`AdminSearch`), num
 * listener de `document`. Um atalho declarado em `addKeyboardShortcuts` só
 * consegue dar `preventDefault` — o evento continuaria subindo e abriria a
 * paleta **por cima** do editor de link. Aqui o handler recebe o evento cru e
 * pode `stopPropagation`, que é o que sustenta a regra:
 *
 * > com o cursor no editor, ⌘K é link; em qualquer outro lugar do painel,
 * > continua sendo a paleta.
 *
 * É a divisão que Notion, Linear e Google Docs fazem, e a que o critério da
 * issue pede — escrever é o contexto em que ⌘K significa "linkar isto".
 * O `preventDefault` também segura o ⌘K nativo do Chrome (busca na barra de
 * endereços), que tiraria o foco da página no meio da escrita.
 */
export function createLinkShortcutExtension({ onRequestLink }: LinkShortcutOptions) {
  return Extension.create({
    name: 'linkShortcut',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('linkShortcut'),
          props: {
            handleKeyDown(_view, event) {
              const isMod = event.metaKey || event.ctrlKey;
              if (!isMod || event.key.toLowerCase() !== 'k') return false;
              event.preventDefault();
              event.stopPropagation();
              onRequestLink();
              return true;
            },
          },
        }),
      ];
    },
  });
}
