import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import { createContentExtensions } from '@systembook/docs-site';
import { ComponentEmbedEditControls } from './ComponentEmbedEditControls.js';
import { DosDontsCoverField } from './DosDontsCoverField.js';
import {
  CalloutVariantSwitcher,
  CodeLanguageSelect,
  DosDontsTitleField,
  DosDontsVariantSwitcher,
} from './NodeEditControls.js';

/**
 * Extensões do editor (SYS-89): o conjunto de conteúdo
 * (`createContentExtensions`, de `@systembook/docs-site`) com os controles de edição injetados nos
 * NodeViews, mais o que só existe editando — histórico e cursores de
 * arrastar/gap. As que dependem de estado React (menu "/", Cmd/Ctrl+K) são
 * acrescentadas pelo próprio `ContentEditor`.
 */
export const editorExtensions = [
  ...createContentExtensions({
    callout: { VariantSwitcher: CalloutVariantSwitcher },
    codeBlock: { LanguageSelect: CodeLanguageSelect },
    componentEmbed: { EditControls: ComponentEmbedEditControls },
    dosDonts: {
      CoverField: DosDontsCoverField,
      VariantSwitcher: DosDontsVariantSwitcher,
      TitleField: DosDontsTitleField,
    },
  }),
  UndoRedo,
  Dropcursor,
  Gapcursor,
];
