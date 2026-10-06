import { useEffect, useRef, useState } from 'react';
import { toCssVar, toJsPath } from '@systembook/content/tokens';
import { copyText } from '../clipboard.js';

/** Os nomes que o leitor copia de um token — as regras moram em `@systembook/content/tokens`. */
const FORMATS = [
  { id: 'css', label: 'CSS', name: 'CSS variable', text: (path: string) => `var(${toCssVar(path)})` },
  { id: 'js', label: 'JS', name: 'JS path', text: toJsPath },
  { id: 'path', label: 'Path', name: 'token path', text: (path: string) => path },
] as const;

type FormatId = (typeof FORMATS)[number]['id'];

/** Quanto tempo o botão diz "Copied" (ou que falhou) antes de voltar. */
const FEEDBACK_MS = 2000;

/**
 * Botões de copiar o nome de um token (SYS-133): a variável CSS (`var(--x)`),
 * o acesso em JS e o caminho. O texto copiado aparece no `title`, para quem
 * quer conferir antes; numa falha (sem Clipboard API e sem `execCommand`), o
 * botão diz que não copiou em vez de fingir sucesso.
 */
export function TokenCopy({ path }: { path: string }) {
  const [result, setResult] = useState<{ id: FormatId; ok: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function copy(id: FormatId, text: string) {
    void copyText(text).then((ok) => {
      setResult({ id, ok });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setResult(null), FEEDBACK_MS);
    });
  }

  const announce = result ? (result.ok ? 'Copied to clipboard' : 'Could not copy — select the name and copy it') : '';

  return (
    <span className="sb-token-copy">
      {FORMATS.map(({ id, label, name, text }) => {
        const value = text(path);
        const state = result?.id === id ? (result.ok ? 'copied' : 'failed') : undefined;
        return (
          <button
            key={id}
            type="button"
            className="sb-token-copy-button"
            data-state={state}
            title={value}
            aria-label={`Copy ${name} ${value}`}
            onClick={() => copy(id, value)}
          >
            {state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : label}
          </button>
        );
      })}
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </span>
  );
}
