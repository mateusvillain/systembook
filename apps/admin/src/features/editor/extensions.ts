import { Dropcursor, Gapcursor, UndoRedo } from '@tiptap/extensions';
import { createContentExtensions } from '../content/extensions.js';
import { ComponentEmbedEditControls } from './ComponentEmbedEditControls.js';
import { DosDontsCoverField } from './DosDontsCoverField.js';

/**
 * Extensões do editor (SYS-89): o conjunto de conteúdo
 * (`features/content/extensions.ts`) com os controles de edição injetados nos
 * NodeViews de embed e dos-donts, mais o que só existe editando — histórico e
 * cursores de arrastar/gap. As que dependem de estado React (menu "/",
 * Cmd/Ctrl+K) são acrescentadas pelo próprio `ContentEditor`.
 */
export const editorExtensions = [
  ...createContentExtensions({
    componentEmbed: { EditControls: ComponentEmbedEditControls },
    dosDonts: { CoverField: DosDontsCoverField },
  }),
  UndoRedo,
  Dropcursor,
  Gapcursor,
];
