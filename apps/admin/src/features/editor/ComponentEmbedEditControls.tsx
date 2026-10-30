import { useState } from 'react';
import type { ComponentEmbedEditControlsProps } from '@systembook/docs-site';
import { ComponentEmbedPicker } from './ComponentEmbedPicker.js';
import { useT } from '@/i18n/AdminLocale';

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
  onRetry,
  retrying,
  onSelect,
}: ComponentEmbedEditControlsProps) {
  const t = useT();
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
          onClick={onRetry}
          className="sb-embed-action-btn"
        >
          {retrying ? t('editor.embed.checking') : t('editor.embed.tryAgain')}
        </button>
      )}
      <button
        type="button"
        data-testid="component-embed-reselect"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setPickerOpen(true)}
        className="sb-embed-action-btn"
      >
        {hasSelection ? t('editor.embed.replace') : t('editor.embed.select')}
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
