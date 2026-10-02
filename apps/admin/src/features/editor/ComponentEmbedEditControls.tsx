import { useState } from 'react';
import type { ComponentEmbedEditControlsProps } from '../content/nodes/ComponentEmbed.js';
import { ComponentEmbedPicker } from './ComponentEmbedPicker.js';

/**
 * Controles de edição do `component-embed` (SYS-89), injetados no NodeView de
 * renderização pelo editor (`ComponentEmbed.configure({ EditControls })`):
 * "Try again" quando não há preview publicado e a (re)seleção de componente e
 * variante pelo picker (TASK-48).
 */
export function ComponentEmbedEditControls({
  componentName,
  variantId,
  state,
  retry,
  retrying,
  onSelect,
}: ComponentEmbedEditControlsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasSelection = state !== 'unset';

  return (
    <>
      {state === 'empty' && (
        <button
          type="button"
          data-testid="component-embed-retry"
          disabled={retrying}
          onMouseDown={(e) => e.preventDefault()}
          onClick={retry}
          className="sb-embed-action-btn"
        >
          {retrying ? 'Checking…' : 'Try again'}
        </button>
      )}
      <button
        type="button"
        data-testid="component-embed-reselect"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setPickerOpen(true)}
        className="sb-embed-action-btn"
      >
        {hasSelection ? 'Replace component' : 'Select component'}
      </button>
      {pickerOpen && (
        <ComponentEmbedPicker
          initial={hasSelection ? { componentName, variantId: variantId! } : null}
          onConfirm={(selection) => {
            setPickerOpen(false);
            onSelect(selection);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
