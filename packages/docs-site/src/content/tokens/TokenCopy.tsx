import { useCallback, useEffect, useRef, useState } from 'react';
import { toCssVar, toJsPath } from '@systembook/content/tokens';
import { copyText } from '../clipboard.js';

/** Os nomes que o leitor copia de um token — as regras moram em `@systembook/content/tokens`. */
const FORMATS = [
  { id: 'css', label: 'CSS', name: 'CSS variable', text: (path: string) => `var(${toCssVar(path)})` },
  { id: 'js', label: 'JS', name: 'JS path', text: toJsPath },
  { id: 'path', label: 'Path', name: 'token path', text: (path: string) => path },
] as const;

type FormatId = (typeof FORMATS)[number]['id'];

/** "Copied" é recibo: some logo. */
const FEEDBACK_MS = 2000;
/**
 * "Failed" é tarefa (copiar à mão): fica mais, como as instruções de cópia
 * manual do code block — expirar em 2s apagaria antes de o leitor agir.
 */
const FAILURE_MS = 10000;

/**
 * Uma região viva para os botões de copiar de uma tabela (ou lista) inteira.
 * O espaço alternado no fim muda o texto mesmo quando a mensagem se repete,
 * para o leitor de tela anunciar de novo.
 */
export function useCopyAnnouncer() {
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback(
    (message: string) => setAnnouncement((previous) => (previous === message ? `${message} ` : message)),
    [],
  );
  const region = (
    <span className="sr-only" role="status" aria-live="polite">
      {announcement}
    </span>
  );
  return { announce, region };
}

/**
 * Botões de copiar o nome de um token (SYS-133): a variável CSS (`var(--x)`),
 * o acesso em JS e o caminho. O texto copiado aparece no `title`; numa falha
 * (sem Clipboard API e sem `execCommand`) o botão diz que não copiou em vez de
 * fingir sucesso. O anúncio para leitor de tela sai por `onAnnounce`, para a
 * tabela ter uma região viva só.
 */
export function TokenCopy({ path, onAnnounce }: { path: string; onAnnounce: (message: string) => void }) {
  const [result, setResult] = useState<{ id: FormatId; ok: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function copy(id: FormatId, name: string, text: string) {
    void copyText(text).then((ok) => {
      setResult({ id, ok });
      onAnnounce(ok ? `Copied ${name} ${text}` : `Could not copy ${name} — select ${text} and copy it`);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setResult(null), ok ? FEEDBACK_MS : FAILURE_MS);
    });
  }

  return (
    <span className="sb-token-copy">
      {FORMATS.map(({ id, label, name, text }) => {
        const value = text(path);
        const state = result?.id === id ? (result.ok ? 'copied' : 'failed') : undefined;
        const shown = state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : label;
        return (
          <button
            key={id}
            type="button"
            className="sb-token-copy-button"
            data-state={state}
            title={value}
            // Começa pelo texto visível (WCAG 2.5.3): quem fala "CSS" aciona o botão.
            aria-label={`${shown}: copy ${name} ${value}`}
            onClick={() => copy(id, name, value)}
          >
            {shown}
          </button>
        );
      })}
    </span>
  );
}
