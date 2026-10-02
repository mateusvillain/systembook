import { useState } from 'react';
import { Image as ImageIcon, Puzzle, X } from 'lucide-react';
import {
  EmbedCoverPreview,
  type DosDontsCoverFieldProps,
} from '../content/nodes/DosDontsCover.js';
import { ComponentEmbedPicker } from './ComponentEmbedPicker.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Campo de cover **editável** do bloco dos-donts (TASK-73): adicionar, trocar e
 * remover o cover. Injetado no NodeView de renderização pelo editor (SYS-89,
 * `DosDonts.configure({ CoverField })`); a exibição do preview vem da camada de
 * conteúdo (`EmbedCoverPreview`).
 */
export function DosDontsCoverField({ cover, editable, onChange }: DosDontsCoverFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!cover) {
    if (!editable) return null;
    return (
      <div className="sb-dos-donts-cover sb-dos-donts-cover--empty" contentEditable={false}>
        <div role="group" aria-label="Add cover" className="flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange({ kind: 'image', src: '', alt: '' })}
          >
            <ImageIcon /> Add image cover
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPickerOpen(true)}
          >
            <Puzzle /> Add component cover
          </Button>
        </div>
        {pickerOpen && (
          <ComponentEmbedPicker
            onConfirm={(selection) => {
              setPickerOpen(false);
              onChange({
                kind: 'component-embed',
                componentName: selection.componentName,
                variantId: selection.variantId,
              });
            }}
            onCancel={() => setPickerOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="sb-dos-donts-cover" contentEditable={false} data-cover-kind={cover.kind}>
      {cover.kind === 'image' ? (
        <>
          {editable && (
            <div className="sb-dos-donts-cover-image-form">
              <Input
                type="text"
                placeholder="Image URL"
                aria-label="Cover image URL"
                value={cover.src}
                onChange={(e) => onChange({ ...cover, src: e.target.value })}
              />
              <Input
                type="text"
                placeholder="Alt text"
                aria-label="Cover alt text"
                value={cover.alt}
                onChange={(e) => onChange({ ...cover, alt: e.target.value })}
              />
            </div>
          )}
          {cover.src && <img className="sb-dos-donts-cover-image" src={cover.src} alt={cover.alt} />}
        </>
      ) : (
        <>
          {editable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPickerOpen(true)}
            >
              {cover.componentName ? 'Replace component' : 'Select component'}
            </Button>
          )}
          {pickerOpen && (
            <ComponentEmbedPicker
              initial={cover.componentName && cover.variantId ? { componentName: cover.componentName, variantId: cover.variantId } : null}
              onConfirm={(selection) => {
                setPickerOpen(false);
                onChange({
                  kind: 'component-embed',
                  componentName: selection.componentName,
                  variantId: selection.variantId,
                });
              }}
              onCancel={() => setPickerOpen(false)}
            />
          )}
          <EmbedCoverPreview componentName={cover.componentName} variantId={cover.variantId} />
        </>
      )}
      {editable && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground hover:text-destructive"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(null)}
        >
          <X /> Remover cover
        </Button>
      )}
    </div>
  );
}
