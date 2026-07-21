import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PreviewControl, PreviewUpdatePropsMessage } from '@systembook/schema';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/**
 * Painel de controles interativos do preview (TASK-49). Renderiza um input por
 * `PreviewControl` (text/boolean/select, TASK-37) e, a cada mudança, envia
 * `systembook:update-props` ao iframe via `postMessage` — contrato consumido
 * pelo `mount()` do preview-kit (TASK-38), que mescla as props e re-renderiza
 * sem reload.
 */

/**
 * Valor de `type` da mensagem (o admin não depende de preview-kit; o literal é
 * anotado contra o tipo do schema para não divergir — mesma convenção do
 * server com BLOCK_TYPES). O preview-kit exporta o mesmo literal.
 */
const UPDATE_PROPS_MESSAGE_TYPE: PreviewUpdatePropsMessage['type'] = 'systembook:update-props';

function initialValue(control: PreviewControl, variantProps: Record<string, unknown>): unknown {
  if (control.propName in variantProps) return variantProps[control.propName];
  if (control.defaultValue !== undefined) return control.defaultValue;
  switch (control.kind) {
    case 'boolean':
      return false;
    case 'select':
      return control.options[0] ?? '';
    default:
      return '';
  }
}

export function ControlsPanel({
  controls,
  variantProps,
  iframeRef,
}: {
  controls: PreviewControl[];
  /** Props iniciais da variante atual — semeiam os valores dos controles. */
  variantProps: Record<string, unknown>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const c of controls) initial[c.propName] = initialValue(c, variantProps);
    return initial;
  });

  const update = (propName: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [propName]: value }));
    const message: PreviewUpdatePropsMessage = {
      type: UPDATE_PROPS_MESSAGE_TYPE,
      props: { [propName]: value },
    };
    // targetOrigin '*': o iframe usa sandbox="allow-scripts" SEM
    // allow-same-origin (TASK-47), então tem origem opaca — um targetOrigin
    // concreto nunca casaria e a mensagem seria descartada. O envio é para um
    // contentWindow específico (não broadcast) e as props são valores de demo
    // não sensíveis; além disso o preview-kit valida a origin do REMETENTE
    // (event.origin === referrer) do seu lado, então a proteção real está lá.
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  };

  if (controls.length === 0) return null;

  return (
    <div className="sb-controls-panel" data-testid="controls-panel">
      <button
        type="button"
        className="sb-controls-toggle"
        aria-expanded={expanded}
        data-testid="controls-toggle"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="inline size-4 align-middle" />
        ) : (
          <ChevronRight className="inline size-4 align-middle" />
        )}{' '}
        Controles ({controls.length})
      </button>

      {expanded && (
        <div className="sb-controls-fields" role="group" aria-label="Controles do preview">
          {controls.map((control) => {
            const label = control.label ?? control.propName;
            const value = values[control.propName];
            const id = `sb-control-${control.propName}`;
            return (
              <label key={control.propName} className="sb-control-row" htmlFor={id}>
                <span className="sb-control-label">{label}</span>
                {control.kind === 'text' && (
                  <Input
                    id={id}
                    type="text"
                    className="h-7 w-40"
                    data-control={control.propName}
                    value={String(value ?? '')}
                    onChange={(e) => update(control.propName, e.target.value)}
                  />
                )}
                {control.kind === 'boolean' && (
                  <Switch
                    id={id}
                    data-control={control.propName}
                    checked={Boolean(value)}
                    onCheckedChange={(checked) => update(control.propName, checked)}
                  />
                )}
                {control.kind === 'select' && (
                  <select
                    id={id}
                    data-control={control.propName}
                    value={String(value ?? '')}
                    onChange={(e) => update(control.propName, e.target.value)}
                  >
                    {control.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
